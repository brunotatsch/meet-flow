export interface ConflictingBooking {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
}

export class InvalidRoomBlockDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoomBlockDataError";
  }
}

export class RoomBlockNotFoundError extends Error {
  constructor(readonly roomBlockId: string) {
    super(`Bloqueio ${roomBlockId} não encontrado.`);
    this.name = "RoomBlockNotFoundError";
  }
}

export class RoomBlockConflictError extends Error {
  constructor(readonly roomId: string) {
    super("O período se sobrepõe a outro bloqueio desta sala.");
    this.name = "RoomBlockConflictError";
  }
}

export class RoomBlockBookingConflictError extends Error {
  constructor(
    readonly roomId: string,
    readonly bookings: ConflictingBooking[],
  ) {
    super("A sala já possui reservas conflitantes com o bloqueio solicitado.");
    this.name = "RoomBlockBookingConflictError";
  }
}
