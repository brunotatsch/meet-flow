import { BookingStatus } from "@shared/enums/booking-status";
import { InvalidBookingDataError } from "./errors";

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 100;
const MINUTE_IN_MS = 60_000;

export interface BookingProps {
  id: string;
  companyId: string;
  roomId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  totalInCents: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookingProps {
  companyId: string;
  roomId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Grade vigente da sala no dia da reserva; a duração precisa ser múltipla dela. */
  slotMinutes: number;
  /** Sempre calculado no servidor. Ver `bookingTotalInCents`. */
  totalInCents: number;
  notes?: string | null;
}

/**
 * Reserva de uma sala em um período fechado no tempo absoluto.
 *
 * Duas invariantes valem para qualquer instância, criada ou reidratada:
 * `endsAt > startsAt` e `totalInCents` inteiro não negativo - as mesmas dos `CHECK`
 * `bookings_period_valid` e `bookings_total_non_negative`.
 *
 * O alinhamento com a grade (`duração` múltipla de `slotMinutes`) é invariante **de
 * criação**, não de reidratação: a agenda da sala pode mudar depois, e uma reserva
 * feita sob a grade antiga continua válida. Recusá-la no `restore` tornaria
 * impossível listar ou cancelar reservas legítimas assim que o admin trocasse
 * `slot_minutes`.
 *
 * A reserva nasce `confirmed` porque o MVP ainda não tem pagamento. Quando a
 * MVP-08 entrar, o estado inicial passa a ser `pending` e a confirmação vira
 * consequência do webhook.
 */
export class Booking {
  private constructor(private props: BookingProps) {}

  static create(input: CreateBookingProps): Booking {
    const now = new Date();
    const booking = Booking.restore({
      id: crypto.randomUUID(),
      companyId: input.companyId,
      roomId: input.roomId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: BookingStatus.CONFIRMED,
      totalInCents: input.totalInCents,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    assertAlignedDuration(booking.startsAt, booking.endsAt, input.slotMinutes);

    return booking;
  }

  static restore(props: BookingProps): Booking {
    if (props.endsAt.getTime() <= props.startsAt.getTime()) {
      throw new InvalidBookingDataError("endsAt deve ser posterior a startsAt.");
    }

    return new Booking({
      ...props,
      customerName: validateCustomerName(props.customerName),
      customerEmail: validateCustomerEmail(props.customerEmail),
      totalInCents: validateTotal(props.totalInCents),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get companyId(): string {
    return this.props.companyId;
  }

  get roomId(): string {
    return this.props.roomId;
  }

  get customerName(): string {
    return this.props.customerName;
  }

  get customerEmail(): string {
    return this.props.customerEmail;
  }

  get customerPhone(): string | null {
    return this.props.customerPhone;
  }

  get startsAt(): Date {
    return this.props.startsAt;
  }

  get endsAt(): Date {
    return this.props.endsAt;
  }

  get status(): BookingStatus {
    return this.props.status;
  }

  get totalInCents(): number {
    return this.props.totalInCents;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Duração em minutos, sempre positiva pela invariante `endsAt > startsAt`. */
  get durationInMinutes(): number {
    return (this.props.endsAt.getTime() - this.props.startsAt.getTime()) / MINUTE_IN_MS;
  }

  /**
   * Libera o horário: reserva cancelada sai do índice de `bookings_no_overlap` e o
   * slot volta para a grade.
   *
   * Cancelar de novo é no-op em vez de erro - o cliente que reenvia a requisição por
   * timeout de rede deve encontrar o mesmo estado, não uma falha.
   *
   * Ainda não existe transição para `completed` no produto; quando existir, cancelar
   * uma reserva já concluída precisará ser recusado aqui.
   */
  cancel(): void {
    if (this.props.status === BookingStatus.CANCELLED) {
      return;
    }

    this.props.status = BookingStatus.CANCELLED;
    this.props.updatedAt = new Date();
  }
}

function assertAlignedDuration(startsAt: Date, endsAt: Date, slotMinutes: number): void {
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
    throw new InvalidBookingDataError("slotMinutes deve ser um inteiro positivo.");
  }

  const durationMs = endsAt.getTime() - startsAt.getTime();

  if (durationMs % (slotMinutes * MINUTE_IN_MS) !== 0) {
    throw new InvalidBookingDataError(
      `A duração da reserva deve ser múltipla de ${slotMinutes} minutos.`,
    );
  }
}

function validateCustomerName(customerName: string): string {
  const trimmed = customerName.trim();

  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    throw new InvalidBookingDataError(
      `customerName deve ter entre ${MIN_NAME_LENGTH} e ${MAX_NAME_LENGTH} caracteres.`,
    );
  }

  return trimmed;
}

/**
 * O formato do e-mail é validado pelo schema Zod na borda HTTP. Aqui a checagem é
 * deliberadamente frouxa - só o que impede uma reserva de nascer sem contato
 * utilizável -, porque duplicar a regra de formato em dois lugares garante que as
 * duas divirjam com o tempo.
 */
function validateCustomerEmail(customerEmail: string): string {
  const trimmed = customerEmail.trim();

  if (!trimmed.includes("@") || /\s/.test(trimmed)) {
    throw new InvalidBookingDataError("customerEmail deve ser um e-mail válido.");
  }

  return trimmed;
}

function validateTotal(totalInCents: number): number {
  if (!Number.isInteger(totalInCents) || totalInCents < 0) {
    throw new InvalidBookingDataError("totalInCents deve ser um inteiro não negativo.");
  }

  return totalInCents;
}
