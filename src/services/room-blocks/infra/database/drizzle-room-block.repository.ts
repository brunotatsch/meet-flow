import { and, asc, eq, gt, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { BookingStatus } from "@shared/enums/booking-status";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { db } from "@services/database/client";
import {
  CHECK_VIOLATION,
  EXCLUSION_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  findPostgresFailure,
} from "@services/database/postgres-error";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import {
  InvalidRoomBlockDataError,
  RoomBlockBookingConflictError,
  RoomBlockConflictError,
} from "../../domain/errors";
import type { RoomBlock } from "../../domain/room-block.entity";
import {
  RoomBlockRepository,
  type BlockedPeriod,
  type OccupancyInterval,
  type RoomBlockFilters,
} from "../../domain/room-block.repository";
import { toRoomBlockEntity, toRoomBlockRow } from "./room-block.mapper";
import { roomBlocks } from "./schema/room-blocks";

export class DrizzleRoomBlockRepository extends RoomBlockRepository {
  async findById(id: string, companyId: string): Promise<RoomBlock | null> {
    const [row] = await db
      .select()
      .from(roomBlocks)
      .where(and(eq(roomBlocks.id, id), eq(roomBlocks.companyId, companyId)))
      .limit(1);

    return row ? toRoomBlockEntity(row) : null;
  }

  async listByCompany(companyId: string, filters: RoomBlockFilters): Promise<RoomBlock[]> {
    const conditions = [
      eq(roomBlocks.companyId, companyId),
      lt(roomBlocks.startsAt, filters.to),
      gt(roomBlocks.endsAt, filters.from),
    ];
    if (filters.roomId) conditions.push(eq(roomBlocks.roomId, filters.roomId));

    const rows = await db
      .select()
      .from(roomBlocks)
      .where(and(...conditions))
      .orderBy(asc(roomBlocks.startsAt));
    return rows.map(toRoomBlockEntity);
  }

  async listBlockedPeriods(
    companyId: string,
    roomId: string,
    from: Date,
    to: Date,
  ): Promise<BlockedPeriod[]> {
    const rows = await db
      .select({
        id: roomBlocks.id,
        startsAt: roomBlocks.startsAt,
        endsAt: roomBlocks.endsAt,
        reason: roomBlocks.reason,
      })
      .from(roomBlocks)
      .where(
        and(
          eq(roomBlocks.companyId, companyId),
          eq(roomBlocks.roomId, roomId),
          lt(roomBlocks.startsAt, to),
          gt(roomBlocks.endsAt, from),
        ),
      )
      .orderBy(asc(roomBlocks.startsAt));

    return rows;
  }

  async hasConflict(
    companyId: string,
    roomId: string,
    interval: OccupancyInterval,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: roomBlocks.id })
      .from(roomBlocks)
      .where(
        and(
          eq(roomBlocks.companyId, companyId),
          eq(roomBlocks.roomId, roomId),
          lt(roomBlocks.startsAt, interval.endsAt),
          gt(roomBlocks.endsAt, interval.startsAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async createSeries(blocks: RoomBlock[]): Promise<void> {
    const first = blocks[0];
    if (!first) return;

    try {
      await db.transaction(async (tx) => {
        /** A mesma linha é travada pelo trigger de `bookings`, serializando as tabelas. */
        await tx.execute(sql`
          SELECT id FROM rooms
          WHERE id = ${first.roomId} AND company_id = ${first.companyId}
          FOR UPDATE
        `);

        const from = new Date(Math.min(...blocks.map((block) => block.startsAt.getTime())));
        const to = new Date(Math.max(...blocks.map((block) => block.endsAt.getTime())));
        const possibleConflicts = await tx
          .select({
            id: bookings.id,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
            status: bookings.status,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.companyId, first.companyId),
              eq(bookings.roomId, first.roomId),
              ne(bookings.status, BookingStatus.CANCELLED),
              or(
                ne(bookings.status, BookingStatus.PENDING),
                and(isNotNull(bookings.expiresAt), gt(bookings.expiresAt, sql`now()`)),
              ),
              lt(bookings.startsAt, to),
              gt(bookings.endsAt, from),
            ),
          );
        const conflicts = possibleConflicts.filter((booking) =>
          blocks.some(
            (block) => booking.startsAt < block.endsAt && booking.endsAt > block.startsAt,
          ),
        );

        if (conflicts.length > 0) {
          throw new RoomBlockBookingConflictError(first.roomId, conflicts);
        }

        await tx.insert(roomBlocks).values(blocks.map(toRoomBlockRow));
      });
    } catch (error) {
      throw mapRepositoryError(error, first);
    }
  }

  async delete(
    id: string,
    companyId: string,
    scope: "occurrence" | "series",
  ): Promise<RoomBlock[]> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(roomBlocks)
        .where(and(eq(roomBlocks.id, id), eq(roomBlocks.companyId, companyId)))
        .limit(1);
      if (!existing) return [];

      const condition =
        scope === "series" && existing.recurrenceGroupId
          ? and(
              eq(roomBlocks.companyId, companyId),
              eq(roomBlocks.recurrenceGroupId, existing.recurrenceGroupId),
            )
          : and(eq(roomBlocks.id, id), eq(roomBlocks.companyId, companyId));
      const deleted = await tx.delete(roomBlocks).where(condition).returning();
      return deleted.map(toRoomBlockEntity);
    });
  }
}

function mapRepositoryError(error: unknown, block: RoomBlock): unknown {
  if (
    error instanceof RoomBlockBookingConflictError ||
    error instanceof RoomBlockConflictError ||
    error instanceof InvalidRoomBlockDataError
  ) {
    return error;
  }

  const failure = findPostgresFailure(error);
  if (!failure) return error;

  if (failure.sqlState === EXCLUSION_VIOLATION) {
    if (failure.constraint === "room_blocks_bookings_no_overlap") {
      return new RoomBlockBookingConflictError(block.roomId, []);
    }
    if (failure.constraint === "room_blocks_no_overlap") {
      return new RoomBlockConflictError(block.roomId);
    }
  }

  if (
    failure.sqlState === FOREIGN_KEY_VIOLATION &&
    failure.constraint === "room_blocks_room_id_company_id_fk"
  ) {
    return new RoomNotFoundError(block.roomId);
  }

  if (failure.sqlState === CHECK_VIOLATION) {
    return new InvalidRoomBlockDataError("Bloqueio de sala inválido.");
  }

  return error;
}
