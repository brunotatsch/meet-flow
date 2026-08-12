import { RoomSchedule } from "@services/rooms/domain/room-schedule.entity";
import type { roomSchedules } from "./schema/room-schedules";

type RoomScheduleRow = typeof roomSchedules.$inferSelect;
type RoomScheduleInsert = typeof roomSchedules.$inferInsert;

export function toRoomScheduleEntity(row: RoomScheduleRow): RoomSchedule {
  return RoomSchedule.restore({
    id: row.id,
    roomId: row.roomId,
    weekday: row.weekday,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    slotMinutes: row.slotMinutes,
  });
}

export function toRoomScheduleRow(schedule: RoomSchedule): RoomScheduleInsert {
  return {
    id: schedule.id,
    roomId: schedule.roomId,
    weekday: schedule.weekday,
    opensAt: schedule.opensAt,
    closesAt: schedule.closesAt,
    slotMinutes: schedule.slotMinutes,
  };
}
