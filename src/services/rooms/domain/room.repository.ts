import type { Room } from "./room.entity";

export interface RoomFilters {
  minCapacity?: number;
  isActive?: boolean;
}

export abstract class RoomRepository {
  abstract findById(id: string, companyId: string): Promise<Room | null>;
  abstract listByCompany(companyId: string, filters?: RoomFilters): Promise<Room[]>;
  abstract create(room: Room): Promise<void>;
  abstract update(room: Room): Promise<void>;
  abstract delete(id: string, companyId: string): Promise<void>;
}
