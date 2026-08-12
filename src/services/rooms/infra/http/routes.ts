import type { FastifyInstance } from "fastify";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { CreateRoomUseCase } from "../../application/create-room.use-case";
import { DeactivateRoomUseCase } from "../../application/deactivate-room.use-case";
import { DeleteRoomScheduleUseCase } from "../../application/delete-room-schedule.use-case";
import { GetRoomUseCase } from "../../application/get-room.use-case";
import { ListRoomSchedulesUseCase } from "../../application/list-room-schedules.use-case";
import { ListRoomsUseCase } from "../../application/list-rooms.use-case";
import { ReplaceRoomSchedulesUseCase } from "../../application/replace-room-schedules.use-case";
import { UpdateRoomUseCase } from "../../application/update-room.use-case";
import { DrizzleRoomScheduleRepository } from "../database/drizzle-room-schedule.repository";
import { DrizzleRoomRepository } from "../database/drizzle-room.repository";
import { RoomScheduleController } from "./room-schedule.controller";
import { RoomController } from "./room.controller";

export async function registerRoomRoutes(app: FastifyInstance): Promise<void> {
  const roomRepository = new DrizzleRoomRepository();
  const roomScheduleRepository = new DrizzleRoomScheduleRepository();
  const controller = new RoomController(
    new CreateRoomUseCase(roomRepository),
    new ListRoomsUseCase(roomRepository),
    new GetRoomUseCase(roomRepository),
    new UpdateRoomUseCase(roomRepository),
    new DeactivateRoomUseCase(roomRepository),
  );
  const scheduleController = new RoomScheduleController(
    new ListRoomSchedulesUseCase(roomRepository, roomScheduleRepository),
    new ReplaceRoomSchedulesUseCase(roomRepository, roomScheduleRepository),
    new DeleteRoomScheduleUseCase(roomRepository, roomScheduleRepository),
  );

  app.post("/rooms", { preHandler: requireAuth }, (request, reply) =>
    controller.create(request, reply),
  );
  app.get("/rooms", { preHandler: requireAuth }, (request, reply) =>
    controller.list(request, reply),
  );

  app.get<{ Params: { id: string } }>("/rooms/:id", { preHandler: requireAuth }, (request, reply) =>
    controller.getById(request, reply),
  );

  app.patch<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAuth },
    (request, reply) => controller.update(request, reply),
  );

  app.delete<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAuth },
    (request, reply) => controller.deactivate(request, reply),
  );

  /**
   * A agenda é filha da sala: o `PUT` troca a semana inteira de uma vez, e o
   * `DELETE` fecha um dia específico. Não existe `POST` porque
   * `room_schedules_room_id_weekday_unique` já define a chave natural - criar e
   * atualizar são a mesma operação.
   */
  app.get<{ Params: { id: string } }>(
    "/rooms/:id/schedules",
    { preHandler: requireAuth },
    (request, reply) => scheduleController.list(request, reply),
  );

  app.put<{ Params: { id: string } }>(
    "/rooms/:id/schedules",
    { preHandler: requireAuth },
    (request, reply) => scheduleController.replace(request, reply),
  );

  app.delete<{ Params: { id: string; weekday: string } }>(
    "/rooms/:id/schedules/:weekday",
    { preHandler: requireAuth },
    (request, reply) => scheduleController.delete(request, reply),
  );
}
