import { BookingStatus } from "@shared/enums/booking-status";
import { Booking } from "@services/bookings/domain/booking.entity";
import {
  BookingRepository,
  type BookingFilters,
} from "@services/bookings/domain/booking.repository";
import { BookingConflictError } from "@services/bookings/domain/errors";
import type { BookedPeriod } from "@services/bookings/domain/slot";

interface SeedBooking {
  companyId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  status?: BookingStatus;
}

/**
 * Réplica em memória do contrato de `BookingRepository`. Reproduz os recortes que o
 * repositório Drizzle delega ao Postgres:
 *
 * - reservas canceladas não ocupam a sala e a busca de períodos é por sobreposição
 *   com `[from, to)`, não por início dentro do intervalo;
 * - `create` e `update` rejeitam sobreposição na mesma sala com `BookingConflictError`,
 *   como a constraint `bookings_no_overlap` faz no banco.
 *
 * A colisão é reproduzida aqui de propósito: sem isso, o spec do caso de uso passaria
 * enquanto a única defesa real do produto contra double-booking ficaria sem cobertura
 * unitária. A corrida de verdade, com N requisições concorrentes, continua sendo
 * exercitada só no e2e, contra o Postgres.
 */
export class InMemoryBookingRepository extends BookingRepository {
  private readonly bookings: Booking[] = [];

  /** Semeia uma reserva já existente, sem passar pelas invariantes de criação. */
  add(input: SeedBooking): Booking {
    const now = new Date();
    const booking = Booking.restore({
      id: crypto.randomUUID(),
      companyId: input.companyId,
      roomId: input.roomId,
      customerName: "Cliente Existente",
      customerEmail: "cliente@exemplo.com",
      customerPhone: null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status ?? BookingStatus.CONFIRMED,
      totalInCents: 0,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    this.bookings.push(booking);

    return booking;
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
          booking.status !== BookingStatus.CANCELLED &&
          booking.startsAt.getTime() < to.getTime() &&
          booking.endsAt.getTime() > from.getTime(),
      )
      .map(({ startsAt, endsAt }) => ({ startsAt, endsAt }));
  }

  async findById(id: string, companyId: string): Promise<Booking | null> {
    return (
      this.bookings.find((booking) => booking.id === id && booking.companyId === companyId) ?? null
    );
  }

  async listByCompany(companyId: string, filters: BookingFilters): Promise<Booking[]> {
    return this.bookings
      .filter(
        (booking) =>
          booking.companyId === companyId &&
          (filters.roomId === undefined || booking.roomId === filters.roomId) &&
          booking.startsAt.getTime() < filters.to.getTime() &&
          booking.endsAt.getTime() > filters.from.getTime(),
      )
      .sort((first, second) => first.startsAt.getTime() - second.startsAt.getTime());
  }

  async create(booking: Booking): Promise<void> {
    this.assertNoOverlap(booking);
    this.bookings.push(booking);
  }

  async update(booking: Booking): Promise<void> {
    this.assertNoOverlap(booking);

    const index = this.bookings.findIndex((stored) => stored.id === booking.id);

    if (index >= 0) {
      this.bookings[index] = booking;
    }
  }

  private assertNoOverlap(booking: Booking): void {
    if (booking.status === BookingStatus.CANCELLED) {
      return;
    }

    const conflicts = this.bookings.some(
      (stored) =>
        stored.id !== booking.id &&
        stored.roomId === booking.roomId &&
        stored.status !== BookingStatus.CANCELLED &&
        stored.startsAt.getTime() < booking.endsAt.getTime() &&
        stored.endsAt.getTime() > booking.startsAt.getTime(),
    );

    if (conflicts) {
      throw new BookingConflictError(booking.roomId);
    }
  }
}
