import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { CompanyNotFoundError } from "@services/companies/domain/errors";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import type { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import { resolveOpeningPeriod } from "../domain/availability";
import { slotsCoveredBy } from "../domain/booking-window";
import {
  BookingInThePastError,
  OutsideBusinessHoursError,
  RoomNotAvailableError,
} from "../domain/errors";
import { calendarDateAt, weekdayOf } from "../domain/time-zone";

export interface BookingPeriodDependencies {
  companyRepository: CompanyRepository;
  roomRepository: RoomRepository;
  roomScheduleRepository: RoomScheduleRepository;
}

export interface BookingPeriodInput {
  companyId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Política única para criação e reagendamento. Ela valida tenant, sala ativa,
 * passado, horário de funcionamento e alinhamento da grade; só a persistência
 * decide conflito concorrente por meio de `bookings_no_overlap`.
 */
export async function validateBookingPeriod(
  input: BookingPeriodInput,
  dependencies: BookingPeriodDependencies,
  now: Date,
) {
  const company = await dependencies.companyRepository.findById(input.companyId);
  if (!company) throw new CompanyNotFoundError(input.companyId);

  const room = await dependencies.roomRepository.findById(input.roomId, input.companyId);
  if (!room) throw new RoomNotFoundError(input.roomId);
  if (!room.isActive) throw new RoomNotAvailableError(room.id);
  if (input.startsAt.getTime() <= now.getTime()) throw new BookingInThePastError();

  const date = calendarDateAt(company.timezone, input.startsAt);
  const schedule = await dependencies.roomScheduleRepository.findByRoomAndWeekday(
    room.id,
    weekdayOf(date),
  );
  if (!schedule) throw new OutsideBusinessHoursError("A sala não abre no dia escolhido.");

  const period = resolveOpeningPeriod(company.timezone, date, {
    opensAtMinutes: schedule.opensAtMinutes,
    closesAtMinutes: schedule.closesAtMinutes,
    slotMinutes: schedule.slotMinutes,
  });
  const slotCount = slotsCoveredBy(
    { startsAt: input.startsAt, endsAt: input.endsAt },
    period,
    schedule.slotMinutes,
  );

  return { company, room, schedule, slotCount };
}
