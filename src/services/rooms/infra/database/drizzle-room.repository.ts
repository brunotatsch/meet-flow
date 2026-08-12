import { and, eq, gte } from "drizzle-orm";
import { db } from "@services/database/client";
import { findPostgresFailure, UNIQUE_VIOLATION } from "@services/database/postgres-error";
import { DuplicateRoomNameError } from "@services/rooms/domain/errors";
import type { Room } from "@services/rooms/domain/room.entity";
import { RoomRepository, type RoomFilters } from "@services/rooms/domain/room.repository";
import { toRoomEntity, toRoomRow } from "./room-mapper";
import { rooms } from "./schema/rooms";

export class DrizzleRoomRepository extends RoomRepository {
  async findById(id: string, companyId: string): Promise<Room | null> {
    const [row] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.companyId, companyId)))
      .limit(1);

    return row ? toRoomEntity(row) : null;
  }

  async listByCompany(companyId: string, filters?: RoomFilters): Promise<Room[]> {
    const conditions = [eq(rooms.companyId, companyId)];

    if (filters?.minCapacity !== undefined) {
      conditions.push(gte(rooms.capacity, filters.minCapacity));
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(rooms.isActive, filters.isActive));
    }

    const rows = await db
      .select()
      .from(rooms)
      .where(and(...conditions));

    return rows.map(toRoomEntity);
  }

  async create(room: Room): Promise<void> {
    try {
      await db.insert(rooms).values(toRoomRow(room));
    } catch (error) {
      throw toRoomRepositoryError(error, room.name);
    }
  }

  async update(room: Room): Promise<void> {
    try {
      await db
        .update(rooms)
        .set(toRoomRow(room))
        .where(and(eq(rooms.id, room.id), eq(rooms.companyId, room.companyId)));
    } catch (error) {
      throw toRoomRepositoryError(error, room.name);
    }
  }

  async delete(id: string, companyId: string): Promise<void> {
    await db.delete(rooms).where(and(eq(rooms.id, id), eq(rooms.companyId, companyId)));
  }
}

/**
 * Traduz a violação de `rooms_company_id_name_unique` em erro de domínio, no
 * mesmo padrão de `sign-up.ts`: a infra converte o SQLSTATE em erro de
 * negócio, então caso de uso e controller nunca veem o detalhe do driver.
 */
function toRoomRepositoryError(error: unknown, name: string): unknown {
  const failure = findPostgresFailure(error);

  if (
    failure?.sqlState === UNIQUE_VIOLATION &&
    failure.constraint === "rooms_company_id_name_unique"
  ) {
    return new DuplicateRoomNameError(name);
  }

  return error;
}
