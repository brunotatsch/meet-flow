export class RoomNotFoundError extends Error {
  constructor(readonly roomId: string) {
    super(`Sala ${roomId} não encontrada.`);
    this.name = "RoomNotFoundError";
  }
}

export class DuplicateRoomNameError extends Error {
  constructor(readonly roomName: string) {
    super(`Já existe uma sala chamada "${roomName}" nesta empresa.`);
    this.name = "DuplicateRoomNameError";
  }
}

export class InvalidRoomDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoomDataError";
  }
}
