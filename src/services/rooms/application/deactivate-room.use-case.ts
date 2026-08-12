import { RoomNotFoundError } from "../domain/errors";
import type { Room } from "../domain/room.entity";
import type { RoomRepository } from "../domain/room.repository";

export class DeactivateRoomUseCase {
  constructor(private readonly roomRepository: RoomRepository) {}

  async execute(id: string, companyId: string): Promise<Room> {
    const room = await this.roomRepository.findById(id, companyId);

    if (!room) {
      throw new RoomNotFoundError(id);
    }

    room.deactivate();
    await this.roomRepository.update(room);

    return room;
  }
}
