import type { FastifyReply, FastifyRequest } from "fastify";
import { WeekScheduleSchema, type RoomScheduleResponse } from "@shared/schemas/schedule.schema";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { DeleteRoomScheduleUseCase } from "../../application/delete-room-schedule.use-case";
import type { ListRoomSchedulesUseCase } from "../../application/list-room-schedules.use-case";
import type { ReplaceRoomSchedulesUseCase } from "../../application/replace-room-schedules.use-case";
import type { RoomSchedule } from "../../domain/room-schedule.entity";
import { mapRoomError } from "./room-error";

interface RoomScheduleParams {
  Params: { id: string };
}

interface RoomScheduleWeekdayParams {
  Params: { id: string; weekday: string };
}

export class RoomScheduleController {
  constructor(
    private readonly listRoomSchedulesUseCase: ListRoomSchedulesUseCase,
    private readonly replaceRoomSchedulesUseCase: ReplaceRoomSchedulesUseCase,
    private readonly deleteRoomScheduleUseCase: DeleteRoomScheduleUseCase,
  ) {}

  async list(
    request: FastifyRequest<RoomScheduleParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);

    const schedules = await this.listRoomSchedulesUseCase
      .execute(request.params.id, companyId)
      .catch(mapRoomError);

    return reply.send(schedules.map(toRoomScheduleResponse));
  }

  async replace(
    request: FastifyRequest<RoomScheduleParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    const parsed = WeekScheduleSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Agenda da sala inválida.", parsed.error.issues);
    }

    const schedules = await this.replaceRoomSchedulesUseCase
      .execute(request.params.id, companyId, parsed.data)
      .catch(mapRoomError);

    return reply.send(schedules.map(toRoomScheduleResponse));
  }

  async delete(
    request: FastifyRequest<RoomScheduleWeekdayParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);

    await this.deleteRoomScheduleUseCase
      .execute(request.params.id, companyId, parseWeekday(request.params.weekday))
      .catch(mapRoomError);

    return reply.code(204).send();
  }
}

function toRoomScheduleResponse(schedule: RoomSchedule): RoomScheduleResponse {
  return {
    id: schedule.id,
    roomId: schedule.roomId,
    weekday: schedule.weekday as RoomScheduleResponse["weekday"],
    opensAt: schedule.opensAt,
    closesAt: schedule.closesAt,
    slotMinutes: schedule.slotMinutes,
  };
}

/**
 * O dia da semana vem no caminho da URL, então chega como texto. Rejeitar aqui o
 * que não é 0..6 evita transformar `/schedules/segunda` em uma consulta que não
 * acha nada e responde 404, confundindo "dia inválido" com "dia sem agenda".
 */
function parseWeekday(value: string): number {
  if (!/^[0-6]$/.test(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", "weekday deve ser um inteiro entre 0 e 6.");
  }

  return Number(value);
}
