export class InvalidAvailabilityDateError extends Error {
  constructor(readonly date: string) {
    super(`Data "${date}" inválida: use o formato YYYY-MM-DD com uma data existente.`);
    this.name = "InvalidAvailabilityDateError";
  }
}

/**
 * O horário pedido colide com uma reserva ativa da mesma sala.
 *
 * Quem decide isso é a constraint `bookings_no_overlap`, não uma leitura prévia:
 * o repositório traduz o SQLSTATE `23P01` neste erro. Ler a agenda antes de gravar
 * só moveria a corrida para a janela entre a leitura e o insert.
 */
export class BookingConflictError extends Error {
  constructor(readonly roomId: string) {
    super("O horário escolhido acabou de ser reservado para esta sala.");
    this.name = "BookingConflictError";
  }
}

/** A sala existe e pertence à empresa, mas está inativa e não aceita reservas. */
export class RoomNotAvailableError extends Error {
  constructor(readonly roomId: string) {
    super(`Sala ${roomId} não está disponível para reservas.`);
    this.name = "RoomNotAvailableError";
  }
}

export class BookingNotFoundError extends Error {
  constructor(readonly bookingId: string) {
    super(`Reserva ${bookingId} não encontrada.`);
    this.name = "BookingNotFoundError";
  }
}

/** O período pedido cai fora da janela de funcionamento da sala naquele dia. */
export class OutsideBusinessHoursError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutsideBusinessHoursError";
  }
}

/**
 * O período pedido está dentro da janela, mas não coincide com as bordas da grade
 * de `slotMinutes` que o motor de disponibilidade oferta.
 *
 * É erro à parte de `OutsideBusinessHoursError` porque a correção é outra: aqui a
 * sala está aberta e o cliente precisa escolher um slot ofertado, não outro dia.
 */
export class SlotNotAlignedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotNotAlignedError";
  }
}

/**
 * O horário pedido já começou.
 *
 * A grade some com slots passados (ver `buildDayAvailability`); sem esta checagem,
 * quem chamasse a API direto reservaria ontem.
 */
export class BookingInThePastError extends Error {
  constructor() {
    super("Não é possível reservar um horário que já começou.");
    this.name = "BookingInThePastError";
  }
}

export class InvalidBookingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBookingDataError";
  }
}

/** A operação é válida, mas não pode partir do estado atual da reserva. */
export class InvalidBookingTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBookingTransitionError";
  }
}

/**
 * Check-in antes do início ou depois do fim precisa de uma decisão humana
 * explícita; a API nunca presume essa confirmação.
 */
export class CheckInOutsideWindowError extends Error {
  constructor() {
    super("O horário atual está fora da janela da reserva. Confirme para continuar.");
    this.name = "CheckInOutsideWindowError";
  }
}
