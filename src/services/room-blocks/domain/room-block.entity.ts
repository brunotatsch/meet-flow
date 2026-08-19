import { InvalidRoomBlockDataError } from "./errors";

const MAX_REASON_LENGTH = 500;

export interface RoomBlockProps {
  id: string;
  companyId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  createdBy: string;
  recurrenceGroupId: string | null;
  createdAt: Date;
}

export interface CreateRoomBlockProps {
  companyId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  createdBy: string;
  recurrenceGroupId?: string | null;
}

/** Uma ocorrência materializada, sempre expressa como intervalo semiaberto `[início, fim)`. */
export class RoomBlock {
  private constructor(private readonly props: RoomBlockProps) {}

  static create(input: CreateRoomBlockProps): RoomBlock {
    return RoomBlock.restore({
      id: crypto.randomUUID(),
      recurrenceGroupId: null,
      createdAt: new Date(),
      ...input,
    });
  }

  static restore(props: RoomBlockProps): RoomBlock {
    const startsAt = validDate(props.startsAt, "startsAt");
    const endsAt = validDate(props.endsAt, "endsAt");
    const reason = props.reason.trim();

    if (endsAt <= startsAt) {
      throw new InvalidRoomBlockDataError("endsAt deve ser posterior a startsAt.");
    }

    if (reason.length === 0 || reason.length > MAX_REASON_LENGTH) {
      throw new InvalidRoomBlockDataError(
        `reason deve ter entre 1 e ${MAX_REASON_LENGTH} caracteres.`,
      );
    }

    if (!props.createdBy.trim()) {
      throw new InvalidRoomBlockDataError("createdBy é obrigatório.");
    }

    return new RoomBlock({
      ...props,
      startsAt,
      endsAt,
      createdAt: validDate(props.createdAt, "createdAt"),
      reason,
      createdBy: props.createdBy.trim(),
    });
  }

  get id() {
    return this.props.id;
  }
  get companyId() {
    return this.props.companyId;
  }
  get roomId() {
    return this.props.roomId;
  }
  get startsAt() {
    return new Date(this.props.startsAt);
  }
  get endsAt() {
    return new Date(this.props.endsAt);
  }
  get reason() {
    return this.props.reason;
  }
  get createdBy() {
    return this.props.createdBy;
  }
  get recurrenceGroupId() {
    return this.props.recurrenceGroupId;
  }
  get createdAt() {
    return new Date(this.props.createdAt);
  }
}

function validDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidRoomBlockDataError(`${field} deve ser uma data válida.`);
  }

  return new Date(value);
}
