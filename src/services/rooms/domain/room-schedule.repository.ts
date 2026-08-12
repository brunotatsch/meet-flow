import type { RoomSchedule } from "./room-schedule.entity";

/**
 * `room_schedules` é parte do agregado `Room`: não tem `company_id` próprio e só é
 * alcançada por `roomId`. O isolamento entre empresas continua garantido porque
 * todo caso de uso carrega a sala antes, via `RoomRepository.findById(id, companyId)`,
 * e uma sala de outro tenant simplesmente não é encontrada. O banco fecha a porta
 * do outro lado: `room_schedules.room_id` referencia `rooms(id)` com `ON DELETE CASCADE`.
 */
export abstract class RoomScheduleRepository {
  /** Semana inteira da sala, ordenada por dia. */
  abstract listByRoom(roomId: string): Promise<RoomSchedule[]>;

  abstract findByRoomAndWeekday(roomId: string, weekday: number): Promise<RoomSchedule | null>;

  /** Substitui a semana inteira em uma transação: ou entra tudo, ou nada muda. */
  abstract replaceForRoom(roomId: string, schedules: RoomSchedule[]): Promise<void>;

  abstract deleteByRoomAndWeekday(roomId: string, weekday: number): Promise<void>;
}
