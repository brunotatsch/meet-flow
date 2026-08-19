import type { FastifyInstance } from "fastify";
import { PermissionAction, PermissionResource } from "@shared/auth/permissions";
import { DrizzleAuditLog } from "@services/audit/infra/database/drizzle-audit-log";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { requirePermission } from "@services/identity/infra/http/require-permission";
import { DrizzleRoomRepository } from "@services/rooms/infra/database/drizzle-room.repository";
import { CreateRoomBlocksUseCase } from "../../application/create-room-blocks.use-case";
import { DeleteRoomBlockUseCase } from "../../application/delete-room-block.use-case";
import { ListRoomBlocksUseCase } from "../../application/list-room-blocks.use-case";
import { DrizzleRoomBlockRepository } from "../database/drizzle-room-block.repository";
import { RoomBlockController } from "./room-block.controller";

export async function registerRoomBlockRoutes(app: FastifyInstance): Promise<void> {
  const blocks = new DrizzleRoomBlockRepository();
  const companies = new DrizzleCompanyRepository();
  const controller = new RoomBlockController(
    new CreateRoomBlocksUseCase(companies, new DrizzleRoomRepository(), blocks),
    new ListRoomBlocksUseCase(companies, blocks),
    new DeleteRoomBlockUseCase(blocks),
    new DrizzleAuditLog(),
  );

  app.get<{ Querystring: { from?: string; to?: string; roomId?: string } }>(
    "/room-blocks",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.READ, PermissionResource.ROOM_BLOCK),
      ],
    },
    (request, reply) => controller.list(request, reply),
  );

  app.post(
    "/room-blocks",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.CREATE, PermissionResource.ROOM_BLOCK),
      ],
    },
    (request, reply) => controller.create(request, reply),
  );

  app.delete<{ Params: { id: string }; Querystring: { scope?: string } }>(
    "/room-blocks/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.DELETE, PermissionResource.ROOM_BLOCK),
      ],
    },
    (request, reply) => controller.delete(request, reply),
  );
}
