import type { Booking } from "../domain/booking.entity";
import type { BookingRepository } from "../domain/booking.repository";
import type { Clock } from "../domain/clock";
import { BookingNotFoundError } from "../domain/errors";

export class MarkBookingNoShowUseCase {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, companyId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findById(id, companyId);
    if (!booking) throw new BookingNotFoundError(id);

    if (booking.markNoShow(this.clock.now())) await this.bookingRepository.update(booking);
    return booking;
  }
}
