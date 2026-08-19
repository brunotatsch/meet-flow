import type { CompanyRepository } from "@services/companies/domain/company.repository";
import type { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import type { Booking } from "../domain/booking.entity";
import type { BookingRepository } from "../domain/booking.repository";
import type { Clock } from "../domain/clock";
import { BookingNotFoundError } from "../domain/errors";
import { validateBookingPeriod } from "./booking-period-policy";

export interface RescheduleBookingCommand {
  id: string;
  companyId: string;
  startsAt: Date;
  endsAt: Date;
}

export class RescheduleBookingUseCase {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly roomRepository: RoomRepository,
    private readonly roomScheduleRepository: RoomScheduleRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RescheduleBookingCommand): Promise<Booking> {
    const booking = await this.bookingRepository.findById(command.id, command.companyId);
    if (!booking) throw new BookingNotFoundError(command.id);

    const now = this.clock.now();
    const { schedule } = await validateBookingPeriod(
      {
        companyId: command.companyId,
        roomId: booking.roomId,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
      },
      {
        companyRepository: this.companyRepository,
        roomRepository: this.roomRepository,
        roomScheduleRepository: this.roomScheduleRepository,
      },
      now,
    );

    const changed = booking.reschedule(command.startsAt, command.endsAt, schedule.slotMinutes, now);
    if (changed) await this.bookingRepository.update(booking);
    return booking;
  }
}
