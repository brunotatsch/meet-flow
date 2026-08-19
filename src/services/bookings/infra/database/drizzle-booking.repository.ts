import { and, asc, eq, gt, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { BookingStatus } from "@shared/enums/booking-status";
import type { Booking } from "@services/bookings/domain/booking.entity";
import {
  BookingRepository,
  type BookingFilters,
} from "@services/bookings/domain/booking.repository";
import { BookingConflictError, InvalidBookingDataError } from "@services/bookings/domain/errors";
import type { BookedPeriod } from "@services/bookings/domain/slot";
import { db } from "@services/database/client";
import {
  CHECK_VIOLATION,
  DATA_EXCEPTION,
  EXCLUSION_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  findPostgresFailure,
} from "@services/database/postgres-error";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import { toBookingEntity, toBookingRow } from "./booking-mapper";
import { bookings } from "./schema/bookings";

export class DrizzleBookingRepository extends BookingRepository {
  async listActivePeriods(
    companyId: string,
    roomId: string,
    from: Date,
    to: Date,
  ): Promise<BookedPeriod[]> {
    /**
     * Sobreposição em intervalo semiaberto: `starts_at < to AND ends_at > from`.
     * Filtrar por `starts_at BETWEEN from AND to` perderia a reserva que começou
     * antes da abertura e ainda está em curso, e a grade ofereceria uma sala ocupada.
     *
     * O índice `bookings_room_id_starts_at_idx` atende o predicado por `room_id` e
     * o corte superior de `starts_at`.
     */
    const rows = await db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.companyId, companyId),
          eq(bookings.roomId, roomId),
          ne(bookings.status, BookingStatus.CANCELLED),
          or(
            ne(bookings.status, BookingStatus.PENDING),
            and(isNotNull(bookings.expiresAt), gt(bookings.expiresAt, sql`now()`)),
          ),
          lt(bookings.startsAt, to),
          gt(bookings.endsAt, from),
        ),
      )
      .orderBy(asc(bookings.startsAt));

    return rows;
  }

  async findById(id: string, companyId: string): Promise<Booking | null> {
    const [row] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.companyId, companyId)))
      .limit(1);

    return row ? toBookingEntity(row) : null;
  }

  async listByCompany(companyId: string, filters: BookingFilters): Promise<Booking[]> {
    const conditions = [
      eq(bookings.companyId, companyId),
      lt(bookings.startsAt, filters.to),
      gt(bookings.endsAt, filters.from),
    ];

    if (filters.roomId) {
      conditions.push(eq(bookings.roomId, filters.roomId));
    }

    const rows = await db
      .select()
      .from(bookings)
      .where(and(...conditions))
      .orderBy(asc(bookings.startsAt));

    return rows.map(toBookingEntity);
  }

  async create(booking: Booking): Promise<void> {
    try {
      await db.insert(bookings).values(toBookingRow(booking));
    } catch (error) {
      throw toBookingRepositoryError(error, booking);
    }
  }

  /**
   * O `update` também traduz `23P01`: reativar uma reserva cancelada a coloca de
   * volta no índice de exclusão e pode colidir com o que ocupou o horário enquanto
   * isso. Hoje só o cancelamento passa por aqui, mas o caminho inverso existe no
   * banco e falharia com 500 se ficasse sem tradução.
   */
  async update(booking: Booking): Promise<void> {
    try {
      await db
        .update(bookings)
        .set(toBookingRow(booking))
        .where(and(eq(bookings.id, booking.id), eq(bookings.companyId, booking.companyId)));
    } catch (error) {
      throw toBookingRepositoryError(error, booking);
    }
  }

  override async expirePending(now: Date, companyId?: string, roomId?: string): Promise<number> {
    const conditions = [
      eq(bookings.status, BookingStatus.PENDING),
      isNotNull(bookings.expiresAt),
      lte(bookings.expiresAt, now),
    ];

    if (companyId) conditions.push(eq(bookings.companyId, companyId));
    if (roomId) conditions.push(eq(bookings.roomId, roomId));

    const rows = await db
      .update(bookings)
      .set({
        status: BookingStatus.CANCELLED,
        cancellationReason: "expired",
        updatedAt: now,
      })
      .where(and(...conditions))
      .returning({ id: bookings.id });

    return rows.length;
  }

  async attachCheckoutSession(bookingId: string, sessionId: string, now: Date): Promise<boolean> {
    const rows = await db
      .update(bookings)
      .set({ stripeCheckoutSessionId: sessionId, updatedAt: now })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.status, BookingStatus.PENDING),
          isNotNull(bookings.expiresAt),
          gt(bookings.expiresAt, now),
        ),
      )
      .returning({ id: bookings.id });

    return rows.length === 1;
  }

  async cancelPendingById(bookingId: string, reason: string, now: Date): Promise<boolean> {
    const rows = await db
      .update(bookings)
      .set({ status: BookingStatus.CANCELLED, cancellationReason: reason, updatedAt: now })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, BookingStatus.PENDING)))
      .returning({ id: bookings.id });

    return rows.length === 1;
  }

  async confirmFreeBooking(bookingId: string, now: Date): Promise<boolean> {
    const rows = await db
      .update(bookings)
      .set({ status: BookingStatus.CONFIRMED, confirmedAt: now, updatedAt: now })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.status, BookingStatus.PENDING),
          eq(bookings.totalInCents, 0),
          isNotNull(bookings.expiresAt),
          gt(bookings.expiresAt, now),
        ),
      )
      .returning({ id: bookings.id });

    return rows.length === 1;
  }

  async findByCheckoutSession(sessionId: string, companyId: string): Promise<Booking | null> {
    const [row] = await db
      .select()
      .from(bookings)
      .where(
        and(eq(bookings.stripeCheckoutSessionId, sessionId), eq(bookings.companyId, companyId)),
      )
      .limit(1);

    return row ? toBookingEntity(row) : null;
  }
}

/**
 * Traduz as violações de constraint de `bookings` em erros de domínio, no mesmo
 * padrão de `DrizzleRoomRepository`: o caso de uso e o controller nunca veem
 * SQLSTATE.
 *
 * `bookings_no_overlap` é a que importa - é ela, e não a aplicação, que decide o
 * vencedor entre requisições simultâneas para o mesmo horário. As demais só chegam
 * aqui se uma invariante de entidade tiver escapado, e viram erro de entrada (400)
 * em vez de 500, porque o dado veio do cliente.
 */
function toBookingRepositoryError(error: unknown, booking: Booking): unknown {
  const failure = findPostgresFailure(error);

  if (!failure) {
    return error;
  }

  if (
    failure.sqlState === EXCLUSION_VIOLATION &&
    (failure.constraint === "bookings_no_overlap" ||
      failure.constraint === "bookings_room_blocks_no_overlap")
  ) {
    return new BookingConflictError(booking.roomId);
  }

  if (
    failure.sqlState === FOREIGN_KEY_VIOLATION &&
    failure.constraint === "bookings_room_id_company_id_fk"
  ) {
    return new RoomNotFoundError(booking.roomId);
  }

  if (
    failure.sqlState === CHECK_VIOLATION &&
    failure.constraint === "bookings_total_non_negative"
  ) {
    return new InvalidBookingDataError("totalInCents deve ser um inteiro não negativo.");
  }

  /**
   * Período invertido morre em `22000`, no construtor de `tstzrange` da coluna
   * gerada, antes de `bookings_period_valid` ser avaliada. Os dois códigos descrevem
   * a mesma entrada inválida e recebem a mesma tradução.
   */
  if (failure.sqlState === CHECK_VIOLATION || failure.sqlState === DATA_EXCEPTION) {
    return new InvalidBookingDataError("endsAt deve ser posterior a startsAt.");
  }

  return error;
}
