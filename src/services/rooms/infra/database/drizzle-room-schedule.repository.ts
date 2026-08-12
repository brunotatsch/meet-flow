import { and, asc, eq } from "drizzle-orm";
import { db } from "@services/database/client";
import type { RoomSchedule } from "@services/rooms/domain/room-schedule.entity";
import { RoomScheduleRepository } from "@services/rooms/domain/room-schedule.repository";
import { toRoomScheduleEntity, toRoomScheduleRow } from "./room-schedule-mapper";
import { roomSchedules } from "./schema/room-schedules";

export class DrizzleRoomScheduleRepository extends RoomScheduleRepository {
  async listByRoom(roomId: string): Promise<RoomSchedule[]> {
    const rows = await db
      .select()
      .from(roomSchedules)
      .where(eq(roomSchedules.roomId, roomId))
      .orderBy(asc(roomSchedules.weekday));

    return rows.map(toRoomScheduleEntity);
  }

  async findByRoomAndWeekday(roomId: string, weekday: number): Promise<RoomSchedule | null> {
    const [row] = await db
      .select()
      .from(roomSchedules)
      .where(and(eq(roomSchedules.roomId, roomId), eq(roomSchedules.weekday, weekday)))
      .limit(1);

    return row ? toRoomScheduleEntity(row) : null;
  }

  /**
   * O delete e o insert vão na mesma transação porque a agenda é editada como um
   * bloco: uma falha no meio deixaria a sala sem nenhuma janela, ou seja, fechada a
   * semana inteira, que é o pior estado possível para um erro transitório produzir.
   */
  async replaceForRoom(roomId: string, schedules: RoomSchedule[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(roomSchedules).where(eq(roomSchedules.roomId, roomId));

      if (schedules.length > 0) {
        await tx.insert(roomSchedules).values(schedules.map(toRoomScheduleRow));
      }
    });
  }

  async deleteByRoomAndWeekday(roomId: string, weekday: number): Promise<void> {
    await db
      .delete(roomSchedules)
      .where(and(eq(roomSchedules.roomId, roomId), eq(roomSchedules.weekday, weekday)));
  }
}
