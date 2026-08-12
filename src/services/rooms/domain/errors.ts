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

export class RoomScheduleNotFoundError extends Error {
  constructor(
    readonly roomId: string,
    readonly weekday: number,
  ) {
    super(`A sala ${roomId} não tem agenda cadastrada para o dia ${weekday}.`);
    this.name = "RoomScheduleNotFoundError";
  }
}

export class InvalidRoomScheduleDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoomScheduleDataError";
  }
}

export class DuplicateWeekdayScheduleError extends Error {
  constructor(readonly weekday: number) {
    super(`A semana enviada tem mais de uma janela para o dia ${weekday}.`);
    this.name = "DuplicateWeekdayScheduleError";
  }
}
