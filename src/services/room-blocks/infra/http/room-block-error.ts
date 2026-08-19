import { HttpError } from "@services/http/http-error";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import {
  InvalidRoomBlockDataError,
  RoomBlockBookingConflictError,
  RoomBlockConflictError,
  RoomBlockNotFoundError,
} from "../../domain/errors";

export function mapRoomBlockError(error: unknown): never {
  if (error instanceof RoomNotFoundError) {
    throw new HttpError(404, "ROOM_NOT_FOUND", error.message);
  }

  if (error instanceof RoomBlockNotFoundError) {
    throw new HttpError(404, "ROOM_BLOCK_NOT_FOUND", error.message);
  }

  if (error instanceof InvalidRoomBlockDataError) {
    throw new HttpError(400, "INVALID_ROOM_BLOCK_DATA", error.message);
  }

  if (error instanceof RoomBlockConflictError) {
    throw new HttpError(409, "ROOM_BLOCK_CONFLICT", error.message);
  }

  if (error instanceof RoomBlockBookingConflictError) {
    throw new HttpError(409, "ROOM_BLOCK_BOOKING_CONFLICT", error.message, {
      bookings: error.bookings.map((booking) => ({
        id: booking.id,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        status: booking.status,
      })),
    });
  }

  throw error;
}
