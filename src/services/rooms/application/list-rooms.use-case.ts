import type { Room } from "../domain/room.entity";
import type { RoomFilters, RoomRepository } from "../domain/room.repository";

export class ListRoomsUseCase {
  constructor(private readonly roomRepository: RoomRepository) {}

  async execute(companyId: string, filters?: RoomFilters): Promise<Room[]> {
    return this.roomRepository.listByCompany(companyId, filters);
  }
}
