import type { Booking } from "../domain/booking.entity";
import type { BookingRepository } from "../domain/booking.repository";
import { BookingNotFoundError } from "../domain/errors";

/**
 * Cancela a reserva e, com isso, devolve o horário para a grade: a constraint
 * `bookings_no_overlap` ignora reservas canceladas, então o mesmo período volta a
 * aceitar um novo insert.
 *
 * A linha não é apagada de propósito. O histórico é o que sustenta relatório,
 * conciliação de pagamento e a resposta para "essa sala foi reservada e cancelada
 * por quem?", que um `DELETE` tornaria impossível.
 */
export class CancelBookingUseCase {
  constructor(private readonly bookingRepository: BookingRepository) {}

  async execute(id: string, companyId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findById(id, companyId);

    if (!booking) {
      throw new BookingNotFoundError(id);
    }

    booking.cancel();
    await this.bookingRepository.update(booking);

    return booking;
  }
}
