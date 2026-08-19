import type { AvailabilityResponse } from "@shared/schemas/booking.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { CompanyNotFoundError } from "@services/companies/domain/errors";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import type { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import type { RoomBlockOccupancyPort } from "@services/room-blocks/domain/room-block.repository";
import {
  buildDayAvailability,
  resolveOpeningPeriod,
  type OpeningWindow,
} from "../domain/availability";
import type { BookingRepository } from "../domain/booking.repository";
import type { Clock } from "../domain/clock";
import { InvalidAvailabilityDateError } from "../domain/errors";
import type { Slot } from "../domain/slot";
import {
  formatIsoWithOffset,
  parseCalendarDate,
  weekdayOf,
  type CalendarDate,
} from "../domain/time-zone";

export interface CheckAvailabilityCommand {
  companyId: string;
  roomId: string;
  /** Data de calendário `YYYY-MM-DD`, lida no fuso da empresa. */
  date: string;
}

/**
 * Monta a grade de horários de uma sala em um dia.
 *
 * O fuso vem da empresa, a janela vem de `room_schedules` e o "agora" vem do
 * `Clock` injetado. Sala sem janela para aquele dia da semana devolve grade vazia,
 * e não um dia aberto por engano: o passo 2 do fluxo público mostra "sem horários"
 * em vez de oferecer 24h de uma sala fechada.
 *
 * Sala inativa é tratada como inexistente, e não como sala sem horários. A
 * distinção importa no fluxo público: quem chega por link antigo recebe 404, em vez
 * de uma grade vazia que parece um dia lotado.
 */
export class CheckAvailabilityUseCase {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly roomRepository: RoomRepository,
    private readonly roomScheduleRepository: RoomScheduleRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly roomBlockOccupancy: RoomBlockOccupancyPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: CheckAvailabilityCommand): Promise<AvailabilityResponse> {
    const date = parseCalendarDate(command.date);

    if (!date) {
      throw new InvalidAvailabilityDateError(command.date);
    }

    const company = await this.companyRepository.findById(command.companyId);

    if (!company) {
      throw new CompanyNotFoundError(command.companyId);
    }

    const room = await this.roomRepository.findById(command.roomId, command.companyId);

    if (!room || !room.isActive) {
      throw new RoomNotFoundError(command.roomId);
    }

    const schedule = await this.roomScheduleRepository.findByRoomAndWeekday(
      room.id,
      weekdayOf(date),
    );

    const slots = schedule
      ? await this.buildSlots({
          timezone: company.timezone,
          companyId: company.id,
          roomId: room.id,
          hourlyRateInCents: room.hourlyRateInCents,
          date,
          window: {
            opensAtMinutes: schedule.opensAtMinutes,
            closesAtMinutes: schedule.closesAtMinutes,
            slotMinutes: schedule.slotMinutes,
          },
        })
      : [];

    return {
      roomId: room.id,
      date: command.date,
      timezone: company.timezone,
      slots: slots.map((slot) => ({
        startsAt: formatIsoWithOffset(slot.startsAt, company.timezone),
        endsAt: formatIsoWithOffset(slot.endsAt, company.timezone),
        available: slot.available,
        priceInCents: slot.priceInCents,
      })),
    };
  }

  private async buildSlots(input: {
    timezone: string;
    companyId: string;
    roomId: string;
    hourlyRateInCents: number;
    date: CalendarDate;
    window: OpeningWindow;
  }): Promise<Slot[]> {
    const period = resolveOpeningPeriod(input.timezone, input.date, input.window);

    /**
     * A busca cobre a janela inteira do dia com semântica de sobreposição, não de
     * "reservas que começam neste intervalo": uma reserva iniciada na véspera e que
     * avança madrugada adentro ocupa os primeiros slots e precisa entrar na conta.
     */
    const [bookedPeriods, blockedPeriods] = await Promise.all([
      this.bookingRepository.listActivePeriods(
        input.companyId,
        input.roomId,
        period.opensAt,
        period.closesAt,
      ),
      this.roomBlockOccupancy.listBlockedPeriods(
        input.companyId,
        input.roomId,
        period.opensAt,
        period.closesAt,
      ),
    ]);

    return buildDayAvailability({
      period,
      slotMinutes: input.window.slotMinutes,
      hourlyRateInCents: input.hourlyRateInCents,
      bookedPeriods: [...bookedPeriods, ...blockedPeriods],
      now: this.clock.now(),
    });
  }
}
