import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { BookingStatus } from "@shared/enums/booking-status";
import { BookingRepository } from "@services/bookings/domain/booking.repository";
import type { BookedPeriod } from "@services/bookings/domain/slot";
import { db } from "@services/database/client";
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
          lt(bookings.startsAt, to),
          gt(bookings.endsAt, from),
        ),
      )
      .orderBy(asc(bookings.startsAt));

    return rows;
  }
}
