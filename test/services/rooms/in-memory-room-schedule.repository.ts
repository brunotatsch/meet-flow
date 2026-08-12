import type { RoomSchedule } from "@services/rooms/domain/room-schedule.entity";
import { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";

/**
 * Réplica em memória do contrato de `RoomScheduleRepository`, incluindo a chave
 * natural `(room_id, weekday)` que a constraint `room_schedules_room_id_weekday_unique`
 * garante no Postgres.
 */
export class InMemoryRoomScheduleRepository extends RoomScheduleRepository {
  private schedules: RoomSchedule[] = [];

  async listByRoom(roomId: string): Promise<RoomSchedule[]> {
    return this.schedules
      .filter((schedule) => schedule.roomId === roomId)
      .sort((first, second) => first.weekday - second.weekday);
  }

  async findByRoomAndWeekday(roomId: string, weekday: number): Promise<RoomSchedule | null> {
    return (
      this.schedules.find(
        (schedule) => schedule.roomId === roomId && schedule.weekday === weekday,
      ) ?? null
    );
  }

  async replaceForRoom(roomId: string, schedules: RoomSchedule[]): Promise<void> {
    this.schedules = [
      ...this.schedules.filter((schedule) => schedule.roomId !== roomId),
      ...schedules,
    ];
  }

  async deleteByRoomAndWeekday(roomId: string, weekday: number): Promise<void> {
    this.schedules = this.schedules.filter(
      (schedule) => !(schedule.roomId === roomId && schedule.weekday === weekday),
    );
  }
}
