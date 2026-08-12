import { RoomNotFoundError, RoomScheduleNotFoundError } from "../domain/errors";
import type { RoomScheduleRepository } from "../domain/room-schedule.repository";
import type { RoomRepository } from "../domain/room.repository";

/** Fecha um dia da semana, sem mexer no resto da agenda. */
export class DeleteRoomScheduleUseCase {
  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly roomScheduleRepository: RoomScheduleRepository,
  ) {}

  async execute(roomId: string, companyId: string, weekday: number): Promise<void> {
    const room = await this.roomRepository.findById(roomId, companyId);

    if (!room) {
      throw new RoomNotFoundError(roomId);
    }

    const schedule = await this.roomScheduleRepository.findByRoomAndWeekday(room.id, weekday);

    if (!schedule) {
      throw new RoomScheduleNotFoundError(roomId, weekday);
    }

    await this.roomScheduleRepository.deleteByRoomAndWeekday(room.id, weekday);
  }
}
