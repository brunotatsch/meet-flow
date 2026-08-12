import { Room } from "@services/rooms/domain/room.entity";
import type { rooms } from "./schema/rooms";

type RoomRow = typeof rooms.$inferSelect;
type RoomInsert = typeof rooms.$inferInsert;

export function toRoomEntity(row: RoomRow): Room {
  return Room.restore({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    capacity: row.capacity,
    hourlyRateInCents: row.hourlyRateInCents,
    amenities: row.amenities,
    photoUrl: row.photoUrl,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toRoomRow(room: Room): RoomInsert {
  return {
    id: room.id,
    companyId: room.companyId,
    name: room.name,
    description: room.description,
    capacity: room.capacity,
    hourlyRateInCents: room.hourlyRateInCents,
    amenities: room.amenities,
    photoUrl: room.photoUrl,
    isActive: room.isActive,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}
