import type { FastifyInstance } from "fastify";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { CreateRoomUseCase } from "../../application/create-room.use-case";
import { DeactivateRoomUseCase } from "../../application/deactivate-room.use-case";
import { GetRoomUseCase } from "../../application/get-room.use-case";
import { ListRoomsUseCase } from "../../application/list-rooms.use-case";
import { UpdateRoomUseCase } from "../../application/update-room.use-case";
import { DrizzleRoomRepository } from "../database/drizzle-room.repository";
import { RoomController } from "./room.controller";

export async function registerRoomRoutes(app: FastifyInstance): Promise<void> {
  const roomRepository = new DrizzleRoomRepository();
  const controller = new RoomController(
    new CreateRoomUseCase(roomRepository),
    new ListRoomsUseCase(roomRepository),
    new GetRoomUseCase(roomRepository),
    new UpdateRoomUseCase(roomRepository),
    new DeactivateRoomUseCase(roomRepository),
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
}
