import { BookingStatus } from "@shared/enums/booking-status";
import {
  CheckInOutsideWindowError,
  InvalidBookingDataError,
  InvalidBookingTransitionError,
} from "./errors";

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 100;
const MINUTE_IN_MS = 60_000;
/**
 * Stripe aceita expires_at a partir de 30 minutos. Um minuto de margem evita que
 * latência e arredondamento para epoch façam a API enxergar menos que o mínimo.
 */
export const BOOKING_HOLD_MINUTES = 31;

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
  expiresAt?: Date | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  confirmedAt?: Date | null;
  cancellationReason?: string | null;
  checkedInAt?: Date | null;
  checkedOutAt?: Date | null;
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
  /** Relógio injetado pelo caso de uso; evita depender da hora da máquina em testes. */
  now?: Date;
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
 * A reserva nasce `pending` e ocupa o horário durante o hold. A confirmação é
 * consequência de pagamento confirmado, total zero ou criação manual autenticada;
 * a expiração e os horários reais são persistidos, sem timers em memória.
 */
export class Booking {
  private constructor(private props: BookingProps) {}

  static create(input: CreateBookingProps): Booking {
    const now = input.now ?? new Date();
    const booking = Booking.restore({
      id: crypto.randomUUID(),
      companyId: input.companyId,
      roomId: input.roomId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: BookingStatus.PENDING,
      totalInCents: input.totalInCents,
      notes: input.notes ?? null,
      expiresAt: new Date(now.getTime() + BOOKING_HOLD_MINUTES * MINUTE_IN_MS),
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      confirmedAt: null,
      cancellationReason: null,
      checkedInAt: null,
      checkedOutAt: null,
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
      expiresAt: props.expiresAt ?? null,
      stripeCheckoutSessionId: props.stripeCheckoutSessionId ?? null,
      stripePaymentIntentId: props.stripePaymentIntentId ?? null,
      confirmedAt: props.confirmedAt ?? null,
      cancellationReason: props.cancellationReason ?? null,
      checkedInAt: props.checkedInAt ?? null,
      checkedOutAt: props.checkedOutAt ?? null,
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

  get expiresAt(): Date | null {
    return this.props.expiresAt ?? null;
  }

  get stripeCheckoutSessionId(): string | null {
    return this.props.stripeCheckoutSessionId ?? null;
  }

  get stripePaymentIntentId(): string | null {
    return this.props.stripePaymentIntentId ?? null;
  }

  get confirmedAt(): Date | null {
    return this.props.confirmedAt ?? null;
  }

  get cancellationReason(): string | null {
    return this.props.cancellationReason ?? null;
  }

  get checkedInAt(): Date | null {
    return this.props.checkedInAt ?? null;
  }

  get checkedOutAt(): Date | null {
    return this.props.checkedOutAt ?? null;
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
   */
  cancel(reason = "cancelled", now = new Date()): void {
    if (this.props.status === BookingStatus.CANCELLED) {
      return;
    }

    if (
      this.props.status === BookingStatus.COMPLETED ||
      this.props.status === BookingStatus.NO_SHOW ||
      this.checkedInAt
    ) {
      throw new InvalidBookingTransitionError("Reserva encerrada não pode ser cancelada.");
    }

    this.props.status = BookingStatus.CANCELLED;
    this.props.cancellationReason = reason;
    this.props.updatedAt = now;
  }

  /** Atualiza somente a cópia em memória depois de um attach condicional no banco. */
  attachCheckoutSession(sessionId: string): void {
    if (this.props.status !== BookingStatus.PENDING) {
      throw new InvalidBookingDataError("Somente reserva pendente aceita Checkout.");
    }

    this.props.stripeCheckoutSessionId = sessionId;
  }

  confirm(now = new Date(), paymentIntentId: string | null = null): boolean {
    if (this.props.status !== BookingStatus.PENDING) return false;

    if (this.expiresAt && this.expiresAt.getTime() <= now.getTime()) {
      this.cancel("expired", now);
      return false;
    }

    this.props.status = BookingStatus.CONFIRMED;
    this.props.confirmedAt = now;
    this.props.stripePaymentIntentId = paymentIntentId;
    this.props.updatedAt = now;
    return true;
  }

  /** Confirma uma reserva criada presencialmente, sem hold ou Checkout da Stripe. */
  confirmManually(now = new Date()): void {
    if (this.props.status !== BookingStatus.PENDING) {
      throw new InvalidBookingTransitionError("Somente reserva pendente pode ser confirmada.");
    }

    this.props.status = BookingStatus.CONFIRMED;
    this.props.confirmedAt = now;
    this.props.expiresAt = null;
    this.props.updatedAt = now;
  }

  /**
   * Move a reserva preservando sala, duração e valor. A grade vigente é validada
   * pelo caso de uso antes desta mutação, e o banco arbitra qualquer sobreposição.
   */
  reschedule(startsAt: Date, endsAt: Date, slotMinutes: number, now = new Date()): boolean {
    if (this.props.status !== BookingStatus.CONFIRMED || this.checkedInAt) {
      throw new InvalidBookingTransitionError(
        "Somente reserva confirmada e ainda sem check-in pode ser remarcada.",
      );
    }

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new InvalidBookingDataError("endsAt deve ser posterior a startsAt.");
    }
    assertAlignedDuration(startsAt, endsAt, slotMinutes);

    if (endsAt.getTime() - startsAt.getTime() !== this.endsAt.getTime() - this.startsAt.getTime()) {
      throw new InvalidBookingDataError("O reagendamento deve preservar a duração da reserva.");
    }

    if (
      startsAt.getTime() === this.startsAt.getTime() &&
      endsAt.getTime() === this.endsAt.getTime()
    ) {
      return false;
    }

    this.props.startsAt = startsAt;
    this.props.endsAt = endsAt;
    this.props.updatedAt = now;
    return true;
  }

  checkIn(now = new Date(), confirmOutsideWindow = false): boolean {
    if (this.checkedInAt) return false;
    if (this.props.status !== BookingStatus.CONFIRMED) {
      throw new InvalidBookingTransitionError("Check-in exige uma reserva confirmada.");
    }

    const outsideWindow =
      now.getTime() < this.startsAt.getTime() || now.getTime() > this.endsAt.getTime();
    if (outsideWindow && !confirmOutsideWindow) {
      throw new CheckInOutsideWindowError();
    }

    this.props.checkedInAt = now;
    this.props.updatedAt = now;
    return true;
  }

  checkOut(now = new Date()): boolean {
    if (this.props.status === BookingStatus.COMPLETED && this.checkedOutAt) return false;
    if (this.props.status !== BookingStatus.CONFIRMED || !this.checkedInAt) {
      throw new InvalidBookingTransitionError("Check-out exige check-in anterior.");
    }
    if (now.getTime() < this.checkedInAt.getTime()) {
      throw new InvalidBookingTransitionError("Check-out não pode anteceder o check-in.");
    }

    this.props.checkedOutAt = now;
    this.props.status = BookingStatus.COMPLETED;
    this.props.updatedAt = now;
    return true;
  }

  markNoShow(now = new Date()): boolean {
    if (this.props.status === BookingStatus.NO_SHOW) return false;
    if (this.props.status !== BookingStatus.CONFIRMED || this.checkedInAt) {
      throw new InvalidBookingTransitionError(
        "Não comparecimento exige reserva confirmada e sem check-in.",
      );
    }
    if (now.getTime() < this.startsAt.getTime()) {
      throw new InvalidBookingTransitionError(
        "Não comparecimento só pode ser marcado após o início da reserva.",
      );
    }

    this.props.status = BookingStatus.NO_SHOW;
    this.props.updatedAt = now;
    return true;
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
