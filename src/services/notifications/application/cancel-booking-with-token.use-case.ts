import { BookingStatus } from "@shared/enums/booking-status";
import type { BookingRepository } from "@services/bookings/domain/booking.repository";
import type { Clock } from "@services/bookings/domain/clock";
import {
  BookingCancellationToken,
  InvalidCancellationTokenError,
} from "../domain/cancellation-token";

export class BookingCancellationNotAllowedError extends Error {
  constructor() {
    super("Esta reserva não pode mais ser cancelada pelo link.");
    this.name = "BookingCancellationNotAllowedError";
  }
}

export class CancelBookingWithTokenUseCase {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly token: BookingCancellationToken,
    private readonly clock: Clock,
  ) {}

  async execute(rawToken: string) {
    const now = this.clock.now();
    const payload = this.token.verify(rawToken, now);
    const booking = await this.bookings.findById(payload.bookingId, payload.companyId);
    if (!booking) throw new InvalidCancellationTokenError();

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BookingCancellationNotAllowedError();
    }

    booking.cancel("customer", now);
    await this.bookings.update(booking);
    return booking;
  }
}
