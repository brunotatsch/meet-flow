import { BookingRepository } from "@services/bookings/domain/booking.repository";
import type { BookedPeriod } from "@services/bookings/domain/slot";

interface StoredBooking extends BookedPeriod {
  companyId: string;
  roomId: string;
  status: string;
}

/**
 * Réplica em memória do contrato de `BookingRepository`. Reproduz os dois recortes
 * que o repositório Drizzle aplica no banco: reservas canceladas não ocupam a sala e
 * a busca é por sobreposição com `[from, to)`, não por início dentro do intervalo.
 */
export class InMemoryBookingRepository extends BookingRepository {
  private readonly bookings: StoredBooking[] = [];

  add(booking: StoredBooking): void {
    this.bookings.push(booking);
  }

  async listActivePeriods(
    companyId: string,
    roomId: string,
    from: Date,
    to: Date,
  ): Promise<BookedPeriod[]> {
    return this.bookings
      .filter(
        (booking) =>
          booking.companyId === companyId &&
          booking.roomId === roomId &&
          booking.status !== "cancelled" &&
          booking.startsAt.getTime() < to.getTime() &&
          booking.endsAt.getTime() > from.getTime(),
      )
      .map(({ startsAt, endsAt }) => ({ startsAt, endsAt }));
  }
}
