import { RoomNotFoundError } from "../domain/errors";
import type { Room } from "../domain/room.entity";
import type { RoomRepository } from "../domain/room.repository";

export interface UpdateRoomCommand {
  name?: string;
  description?: string | null;
  capacity?: number;
  hourlyRateInCents?: number;
  amenities?: string[];
  photoUrl?: string | null;
  isActive?: boolean;
}

export class UpdateRoomUseCase {
  constructor(private readonly roomRepository: RoomRepository) {}

  async execute(id: string, companyId: string, input: UpdateRoomCommand): Promise<Room> {
    const room = await this.roomRepository.findById(id, companyId);

    if (!room) {
      throw new RoomNotFoundError(id);
    }

    if (input.name !== undefined) room.rename(input.name);
    if (input.description !== undefined) room.changeDescription(input.description);
    if (input.capacity !== undefined) room.changeCapacity(input.capacity);
    if (input.hourlyRateInCents !== undefined) room.changeHourlyRate(input.hourlyRateInCents);
    if (input.amenities !== undefined) room.changeAmenities(input.amenities);
    if (input.photoUrl !== undefined) room.changePhotoUrl(input.photoUrl);
    if (input.isActive !== undefined) {
      if (input.isActive) {
        room.activate();
      } else {
        room.deactivate();
      }
    }

    await this.roomRepository.update(room);

    return room;
  }
}
