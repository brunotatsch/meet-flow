import { DuplicateRoomNameError } from "@services/rooms/domain/errors";
import type { Room } from "@services/rooms/domain/room.entity";
import { RoomRepository, type RoomFilters } from "@services/rooms/domain/room.repository";

/**
 * Réplica em memória do contrato de `RoomRepository`, usada pelos specs de
 * caso de uso para exercitar as regras de negócio sem banco. Reproduz o
 * mesmo comportamento que `rooms_company_id_name_unique` garante no Postgres:
 * `create`/`update` rejeitam nome duplicado dentro da mesma empresa.
 */
export class InMemoryRoomRepository extends RoomRepository {
  private readonly rooms = new Map<string, Room>();

  async findById(id: string, companyId: string): Promise<Room | null> {
    const room = this.rooms.get(id);

    return room && room.companyId === companyId ? room : null;
  }

  async listByCompany(companyId: string, filters?: RoomFilters): Promise<Room[]> {
    return [...this.rooms.values()].filter((room) => {
      if (room.companyId !== companyId) return false;
      if (filters?.minCapacity !== undefined && room.capacity < filters.minCapacity) return false;
      if (filters?.isActive !== undefined && room.isActive !== filters.isActive) return false;

      return true;
    });
  }

  async create(room: Room): Promise<void> {
    if (this.hasNameConflict(room)) {
      throw new DuplicateRoomNameError(room.name);
    }

    this.rooms.set(room.id, room);
  }

  async update(room: Room): Promise<void> {
    if (this.hasNameConflict(room)) {
      throw new DuplicateRoomNameError(room.name);
    }

    this.rooms.set(room.id, room);
  }

  async delete(id: string, companyId: string): Promise<void> {
    const room = this.rooms.get(id);

    if (room && room.companyId === companyId) {
      this.rooms.delete(id);
    }
  }

  private hasNameConflict(room: Room): boolean {
    return [...this.rooms.values()].some(
      (existing) =>
        existing.id !== room.id &&
        existing.companyId === room.companyId &&
        existing.name === room.name,
    );
  }
}
