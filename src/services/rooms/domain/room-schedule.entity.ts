import { InvalidRoomScheduleDataError } from "./errors";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const MINUTES_IN_DAY = 24 * 60;

export interface RoomScheduleProps {
  id: string;
  roomId: string;
  /** 0 = domingo ... 6 = sábado, mesma convenção da coluna `weekday`. */
  weekday: number;
  /** Horário de parede `HH:MM:SS`, no fuso da empresa dona da sala. */
  opensAt: string;
  closesAt: string;
  slotMinutes: number;
}

export interface CreateRoomScheduleProps {
  roomId: string;
  weekday: number;
  opensAt: string;
  closesAt: string;
  slotMinutes: number;
}

/**
 * Janela de funcionamento da sala em um dia da semana.
 *
 * `opensAt` e `closesAt` são horário de parede, sem fuso: o fuso mora na empresa
 * (`companies.timezone`) e só é aplicado pelo motor de disponibilidade, quando a
 * janela é resolvida para um dia concreto do calendário. Guardar aqui um instante
 * seria errado - "abre às 9" continua sendo 9 da manhã dos dois lados de uma
 * transição de horário de verão.
 *
 * As invariantes espelham os `CHECK` de `room_schedules`. O conjunto fechado de
 * `slotMinutes` aceito pela API (15, 30, 60, 120) é mais estreito e vive no schema
 * Zod: é regra de produto, não invariante de banco.
 */
export class RoomSchedule {
  private constructor(private readonly props: RoomScheduleProps) {}

  static create(input: CreateRoomScheduleProps): RoomSchedule {
    return RoomSchedule.restore({ id: crypto.randomUUID(), ...input });
  }

  static restore(props: RoomScheduleProps): RoomSchedule {
    const opensAt = normalizeTime(props.opensAt, "opensAt");
    const closesAt = normalizeTime(props.closesAt, "closesAt");

    if (toMinutes(closesAt) <= toMinutes(opensAt)) {
      throw new InvalidRoomScheduleDataError("closesAt deve ser maior que opensAt.");
    }

    return new RoomSchedule({
      ...props,
      weekday: validateWeekday(props.weekday),
      opensAt,
      closesAt,
      slotMinutes: validateSlotMinutes(props.slotMinutes),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get roomId(): string {
    return this.props.roomId;
  }

  get weekday(): number {
    return this.props.weekday;
  }

  get opensAt(): string {
    return this.props.opensAt;
  }

  get closesAt(): string {
    return this.props.closesAt;
  }

  get slotMinutes(): number {
    return this.props.slotMinutes;
  }

  /** Minutos desde a meia-noite local, formato que o motor de slots consome. */
  get opensAtMinutes(): number {
    return toMinutes(this.props.opensAt);
  }

  get closesAtMinutes(): number {
    return toMinutes(this.props.closesAt);
  }
}

/**
 * Aceita `HH:MM` e `HH:MM:SS` e devolve sempre `HH:MM:SS`, como a coluna `time`.
 *
 * Segundo diferente de zero é recusado em vez de truncado: a grade trabalha em
 * minutos, e truncar em silêncio faria uma sala que "abre 09:00:30" render slots
 * meio minuto adiantados sem que ninguém percebesse.
 */
function normalizeTime(value: string, field: string): string {
  const match = TIME_PATTERN.exec(value.trim());

  if (!match) {
    throw new InvalidRoomScheduleDataError(`${field} deve estar no formato HH:MM ou HH:MM:SS.`);
  }

  const [, hour, minute, second = "00"] = match;

  if (second !== "00") {
    throw new InvalidRoomScheduleDataError(`${field} deve ter os segundos zerados.`);
  }

  return `${hour}:${minute}:${second}`;
}

function toMinutes(time: string): number {
  const [hour = "0", minute = "0"] = time.split(":");

  return Number(hour) * 60 + Number(minute);
}

function validateWeekday(weekday: number): number {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new InvalidRoomScheduleDataError("weekday deve ser um inteiro entre 0 e 6.");
  }

  return weekday;
}

function validateSlotMinutes(slotMinutes: number): number {
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0 || slotMinutes > MINUTES_IN_DAY) {
    throw new InvalidRoomScheduleDataError(
      `slotMinutes deve ser um inteiro entre 1 e ${MINUTES_IN_DAY}.`,
    );
  }

  return slotMinutes;
}
