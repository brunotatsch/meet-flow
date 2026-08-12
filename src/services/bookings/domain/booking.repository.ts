import type { BookedPeriod } from "./slot";

export abstract class BookingRepository {
  /**
   * Períodos que ocupam a sala dentro de `[from, to)`, ignorando reservas
   * canceladas - o mesmo recorte de status que a constraint `bookings_no_overlap`
   * usa no banco, para que a grade nunca ofereça um horário que o insert vai
   * recusar, nem esconda um horário que a constraint liberaria.
   *
   * `companyId` entra na query mesmo já tendo sido usado para carregar a sala:
   * é a regra dura de multi-tenancy descrita em `docs/architecture.md`.
   */
  abstract listActivePeriods(
    companyId: string,
    roomId: string,
    from: Date,
    to: Date,
  ): Promise<BookedPeriod[]>;
}
