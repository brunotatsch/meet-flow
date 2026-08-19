import { RoomBlock } from "../../domain/room-block.entity";
import type { roomBlocks } from "./schema/room-blocks";

type RoomBlockRow = typeof roomBlocks.$inferSelect;

export function toRoomBlockEntity(row: RoomBlockRow): RoomBlock {
  return RoomBlock.restore({
    id: row.id,
    companyId: row.companyId,
    roomId: row.roomId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reason: row.reason,
    createdBy: row.createdBy,
    recurrenceGroupId: row.recurrenceGroupId,
    createdAt: row.createdAt,
  });
}

export function toRoomBlockRow(block: RoomBlock): typeof roomBlocks.$inferInsert {
  return {
    id: block.id,
    companyId: block.companyId,
    roomId: block.roomId,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    reason: block.reason,
    createdBy: block.createdBy,
    recurrenceGroupId: block.recurrenceGroupId,
    createdAt: block.createdAt,
  };
}
