import { RoomNotFoundError } from "../domain/errors";
import type { RoomSchedule } from "../domain/room-schedule.entity";
import type { RoomScheduleRepository } from "../domain/room-schedule.repository";
import type { RoomRepository } from "../domain/room.repository";

export class ListRoomSchedulesUseCase {
  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly roomScheduleRepository: RoomScheduleRepository,
  ) {}

  async execute(roomId: string, companyId: string): Promise<RoomSchedule[]> {
    const room = await this.roomRepository.findById(roomId, companyId);

    if (!room) {
      throw new RoomNotFoundError(roomId);
    }

    return this.roomScheduleRepository.listByRoom(room.id);
  }
}
