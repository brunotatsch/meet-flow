import type { CompanyRepository } from "@services/companies/domain/company.repository";
import type { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import { Booking } from "../domain/booking.entity";
import type { BookingRepository } from "../domain/booking.repository";
import type { Clock } from "../domain/clock";
import { bookingTotalInCents } from "../domain/slot";
import { validateBookingPeriod } from "./booking-period-policy";

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
  /** Só a rota autenticada usa `manual`; a rota pública sempre mantém o hold. */
  confirmationMode?: "checkout" | "manual";
}

/**
 * Cria reservas do fluxo público e do walk-in autenticado pela mesma política.
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
    const now = this.clock.now();
    const { company, room, schedule, slotCount } = await validateBookingPeriod(
      command,
      {
        companyRepository: this.companyRepository,
        roomRepository: this.roomRepository,
        roomScheduleRepository: this.roomScheduleRepository,
      },
      now,
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
      now,
    });

    if (command.confirmationMode === "manual") booking.confirmManually(now);

    // Expiração lazy: libera a constraint mesmo quando nenhum cron externo rodou.
    await this.bookingRepository.expirePending(now, company.id, room.id);
    await this.bookingRepository.create(booking);

    return booking;
  }
}
