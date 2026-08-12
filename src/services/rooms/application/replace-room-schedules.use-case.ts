import { DuplicateWeekdayScheduleError, RoomNotFoundError } from "../domain/errors";
import { RoomSchedule } from "../domain/room-schedule.entity";
import type { RoomScheduleRepository } from "../domain/room-schedule.repository";
import type { RoomRepository } from "../domain/room.repository";

export interface RoomScheduleCommand {
  weekday: number;
  opensAt: string;
  closesAt: string;
  slotMinutes: number;
}

/**
 * Substitui a semana inteira da sala.
 *
 * A agenda é editada como um bloco - o formulário do admin mostra os sete dias de
 * uma vez -, então o `PUT` recebe a semana toda e o repositório troca tudo em uma
 * transação. Dia ausente da lista é dia fechado: sala sem janela cadastrada é
 * tratada como indisponível pelo motor de disponibilidade, nunca como aberta 24h.
 */
export class ReplaceRoomSchedulesUseCase {
  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly roomScheduleRepository: RoomScheduleRepository,
  ) {}

  async execute(
    roomId: string,
    companyId: string,
    input: RoomScheduleCommand[],
  ): Promise<RoomSchedule[]> {
    const room = await this.roomRepository.findById(roomId, companyId);

    if (!room) {
      throw new RoomNotFoundError(roomId);
    }

    const schedules = input.map((schedule) =>
      RoomSchedule.create({ roomId: room.id, ...schedule }),
    );

    assertOneWindowPerWeekday(schedules);

    await this.roomScheduleRepository.replaceForRoom(room.id, schedules);

    return [...schedules].sort((first, second) => first.weekday - second.weekday);
  }
}

/**
 * `room_schedules_room_id_weekday_unique` rejeitaria o segundo insert, mas com uma
 * mensagem de constraint. Barrar aqui devolve qual dia veio repetido.
 */
function assertOneWindowPerWeekday(schedules: RoomSchedule[]): void {
  const seen = new Set<number>();

  for (const schedule of schedules) {
    if (seen.has(schedule.weekday)) {
      throw new DuplicateWeekdayScheduleError(schedule.weekday);
    }

    seen.add(schedule.weekday);
  }
}
