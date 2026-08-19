import type { FastifyInstance } from "fastify";
import { PermissionAction, PermissionResource } from "@shared/auth/permissions";
import { DrizzleAuditLog } from "@services/audit/infra/database/drizzle-audit-log";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { requirePermission } from "@services/identity/infra/http/require-permission";
import { PlanAccessService } from "@services/billing/application/plan-access.service";
import { DrizzleSubscriptionRepository } from "@services/billing/infra/database/drizzle-subscription.repository";
import { DrizzleUsageRepository } from "@services/billing/infra/database/drizzle-usage.repository";
import { createPlanLimitPreHandler } from "@services/billing/infra/http/plan-limit";
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
  const auditLog = new DrizzleAuditLog();
  const planAccess = new PlanAccessService(
    new DrizzleSubscriptionRepository(),
    new DrizzleUsageRepository(),
  );
  const roomScheduleRepository = new DrizzleRoomScheduleRepository();
  const controller = new RoomController(
    new CreateRoomUseCase(roomRepository),
    new ListRoomsUseCase(roomRepository),
    new GetRoomUseCase(roomRepository),
    new UpdateRoomUseCase(roomRepository),
    new DeactivateRoomUseCase(roomRepository),
    auditLog,
  );
  const scheduleController = new RoomScheduleController(
    new ListRoomSchedulesUseCase(roomRepository, roomScheduleRepository),
    new ReplaceRoomSchedulesUseCase(roomRepository, roomScheduleRepository),
    new DeleteRoomScheduleUseCase(roomRepository, roomScheduleRepository),
    auditLog,
  );

  app.post(
    "/rooms",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.CREATE, PermissionResource.ROOM),
        createPlanLimitPreHandler(planAccess, "rooms", "authenticated"),
      ],
    },
    (request, reply) => controller.create(request, reply),
  );
  app.get(
    "/rooms",
    {
      preHandler: [requireAuth, requirePermission(PermissionAction.READ, PermissionResource.ROOM)],
    },
    (request, reply) => controller.list(request, reply),
  );

  app.get<{ Params: { id: string } }>(
    "/rooms/:id",
    {
      preHandler: [requireAuth, requirePermission(PermissionAction.READ, PermissionResource.ROOM)],
    },
    (request, reply) => controller.getById(request, reply),
  );

  app.patch<{ Params: { id: string } }>(
    "/rooms/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.UPDATE, PermissionResource.ROOM),
      ],
    },
    (request, reply) => controller.update(request, reply),
  );

  app.delete<{ Params: { id: string } }>(
    "/rooms/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.DELETE, PermissionResource.ROOM),
      ],
    },
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
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.READ, PermissionResource.SCHEDULE),
      ],
    },
    (request, reply) => scheduleController.list(request, reply),
  );

  app.put<{ Params: { id: string } }>(
    "/rooms/:id/schedules",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.UPDATE, PermissionResource.SCHEDULE),
      ],
    },
    (request, reply) => scheduleController.replace(request, reply),
  );

  app.delete<{ Params: { id: string; weekday: string } }>(
    "/rooms/:id/schedules/:weekday",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.UPDATE, PermissionResource.SCHEDULE),
      ],
    },
    (request, reply) => scheduleController.delete(request, reply),
  );
}
