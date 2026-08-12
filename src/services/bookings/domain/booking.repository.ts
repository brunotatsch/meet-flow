import type { Booking } from "./booking.entity";
import type { BookedPeriod } from "./slot";

/**
 * Recorte da agenda da empresa. O período é obrigatório: a listagem alimenta o
 * calendário do admin, que sempre olha um intervalo, e uma listagem sem corte
 * cresceria sem limite junto com o histórico do tenant.
 */
export interface BookingFilters {
  from: Date;
  to: Date;
  roomId?: string;
}

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

  abstract findById(id: string, companyId: string): Promise<Booking | null>;

  /** Reservas que **cruzam** o período pedido, de qualquer status, por sala opcional. */
  abstract listByCompany(companyId: string, filters: BookingFilters): Promise<Booking[]>;

  /**
   * Persiste a reserva ou lança `BookingConflictError` quando o horário já está
   * ocupado. A decisão é do banco (`bookings_no_overlap`), nunca de uma leitura
   * prévia: só a constraint resolve duas requisições simultâneas para o mesmo slot.
   */
  abstract create(booking: Booking): Promise<void>;

  abstract update(booking: Booking): Promise<void>;
}
