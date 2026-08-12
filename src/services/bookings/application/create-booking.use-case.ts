import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { CompanyNotFoundError } from "@services/companies/domain/errors";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import type { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import { resolveOpeningPeriod } from "../domain/availability";
import { slotsCoveredBy } from "../domain/booking-window";
import { Booking } from "../domain/booking.entity";
import type { BookingRepository } from "../domain/booking.repository";
import type { Clock } from "../domain/clock";
import {
  BookingInThePastError,
  OutsideBusinessHoursError,
  RoomNotAvailableError,
} from "../domain/errors";
import { bookingTotalInCents } from "../domain/slot";
import { calendarDateAt, weekdayOf } from "../domain/time-zone";

export interface CreateBookingCommand {
  companyId: string;
  roomId: string;
  /** Instantes absolutos: a borda HTTP só aceita ISO 8601 com offset explícito. */
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  notes?: string | null;
}

/**
 * Cria a reserva do passo 4 do fluxo público.
 *
 * Duas decisões estruturam o caso de uso:
 *
 * **O preço nunca vem do cliente.** `total_in_cents` é recalculado aqui a partir da
 * tarifa da sala e da grade do dia, e um `totalInCents` enviado no corpo é descartado
 * pelo schema Zod antes de chegar até aqui. Confiar no valor do cliente é aceitar
 * reserva de mil reais por um centavo.
 *
 * **O conflito de horário é decidido pelo banco.** Não há leitura de disponibilidade
 * antes do insert: ela só moveria a corrida para a janela entre o `SELECT` e o
 * `INSERT`, e duas requisições simultâneas continuariam passando. Quem arbitra é a
 * constraint `bookings_no_overlap`, e o repositório traduz o `23P01` em
 * `BookingConflictError` -> 409. A garantia é a mesma com uma requisição ou com cem.
 */
export class CreateBookingUseCase {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly roomRepository: RoomRepository,
    private readonly roomScheduleRepository: RoomScheduleRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateBookingCommand): Promise<Booking> {
    const company = await this.companyRepository.findById(command.companyId);

    if (!company) {
      throw new CompanyNotFoundError(command.companyId);
    }

    const room = await this.roomRepository.findById(command.roomId, command.companyId);

    if (!room) {
      throw new RoomNotFoundError(command.roomId);
    }

    if (!room.isActive) {
      throw new RoomNotAvailableError(room.id);
    }

    if (command.startsAt.getTime() <= this.clock.now().getTime()) {
      throw new BookingInThePastError();
    }

    /**
     * O dia da agenda é o dia **no fuso da empresa** em que a reserva começa. Uma
     * reserva das 21:00 de uma segunda em São Paulo já é terça em UTC, e ler o dia da
     * semana do instante bruto a checaria contra a janela errada.
     */
    const date = calendarDateAt(company.timezone, command.startsAt);
    const schedule = await this.roomScheduleRepository.findByRoomAndWeekday(
      room.id,
      weekdayOf(date),
    );

    if (!schedule) {
      throw new OutsideBusinessHoursError("A sala não abre no dia escolhido.");
    }

    const period = resolveOpeningPeriod(company.timezone, date, {
      opensAtMinutes: schedule.opensAtMinutes,
      closesAtMinutes: schedule.closesAtMinutes,
      slotMinutes: schedule.slotMinutes,
    });

    const slotCount = slotsCoveredBy(
      { startsAt: command.startsAt, endsAt: command.endsAt },
      period,
      schedule.slotMinutes,
    );

    const booking = Booking.create({
      companyId: company.id,
      roomId: room.id,
      customerName: command.customerName,
      customerEmail: command.customerEmail,
      customerPhone: command.customerPhone,
      notes: command.notes,
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      slotMinutes: schedule.slotMinutes,
      totalInCents: bookingTotalInCents(room.hourlyRateInCents, schedule.slotMinutes, slotCount),
    });

    await this.bookingRepository.create(booking);

    return booking;
  }
}
