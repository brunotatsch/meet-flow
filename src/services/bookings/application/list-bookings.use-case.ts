import type { Booking } from "../domain/booking.entity";
import type { BookingRepository } from "../domain/booking.repository";
import { InvalidBookingDataError } from "../domain/errors";

export interface ListBookingsCommand {
  companyId: string;
  from: Date;
  to: Date;
  roomId?: string;
}

/**
 * Agenda da empresa em um período, opcionalmente de uma sala só.
 *
 * Inclui reservas canceladas: o calendário do admin precisa mostrar o que foi
 * desmarcado, e esconder isso faria um horário sumir sem explicação entre duas
 * cargas da tela. Quem decide o que exibir é o cliente, a partir do `status`.
 */
export class ListBookingsUseCase {
  constructor(private readonly bookingRepository: BookingRepository) {}

  async execute(command: ListBookingsCommand): Promise<Booking[]> {
    if (command.to.getTime() <= command.from.getTime()) {
      throw new InvalidBookingDataError("to deve ser posterior a from.");
    }

    return this.bookingRepository.listByCompany(command.companyId, {
      from: command.from,
      to: command.to,
      roomId: command.roomId,
    });
  }
}
