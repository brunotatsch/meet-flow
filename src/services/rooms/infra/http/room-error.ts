import { HttpError } from "@services/http/http-error";
import {
  DuplicateRoomNameError,
  DuplicateWeekdayScheduleError,
  InvalidRoomDataError,
  InvalidRoomScheduleDataError,
  RoomNotFoundError,
  RoomScheduleNotFoundError,
} from "../../domain/errors";

/**
 * Tradução única dos erros de domínio do serviço de salas para HTTP, compartilhada
 * pelos controllers de sala e de agenda: sala de outro tenant precisa responder
 * exatamente o mesmo 404 nos dois, senão a diferença de resposta vira um oráculo
 * para descobrir ids de salas alheias.
 *
 * Erro desconhecido é relançado para virar 500 no handler global, em vez de ser
 * mascarado como erro do cliente.
 */
export function mapRoomError(error: unknown): never {
  if (error instanceof RoomNotFoundError) {
    throw new HttpError(404, "ROOM_NOT_FOUND", error.message);
  }

  if (error instanceof RoomScheduleNotFoundError) {
    throw new HttpError(404, "ROOM_SCHEDULE_NOT_FOUND", error.message);
  }

  if (error instanceof DuplicateRoomNameError) {
    throw new HttpError(409, "DUPLICATE_ROOM_NAME", error.message);
  }

  if (error instanceof DuplicateWeekdayScheduleError) {
    throw new HttpError(409, "DUPLICATE_WEEKDAY_SCHEDULE", error.message);
  }

  if (error instanceof InvalidRoomDataError) {
    throw new HttpError(400, "INVALID_ROOM_DATA", error.message);
  }

  if (error instanceof InvalidRoomScheduleDataError) {
    throw new HttpError(400, "INVALID_ROOM_SCHEDULE_DATA", error.message);
  }

  throw error;
}
