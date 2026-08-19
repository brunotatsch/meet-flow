import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AuditAction,
  AuditActorType,
  AuditResource,
  type AuditLog,
} from "@services/audit/domain/audit-log";
import {
  CreateRoomSchema,
  RoomFiltersSchema,
  UpdateRoomSchema,
  type RoomFilters as RoomFiltersInput,
  type RoomResponse,
} from "@shared/schemas/room.schema";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { CreateRoomUseCase } from "../../application/create-room.use-case";
import type { DeactivateRoomUseCase } from "../../application/deactivate-room.use-case";
import type { GetRoomUseCase } from "../../application/get-room.use-case";
import type { ListRoomsUseCase } from "../../application/list-rooms.use-case";
import type { UpdateRoomUseCase } from "../../application/update-room.use-case";
import type { Room } from "../../domain/room.entity";
import { mapRoomError } from "./room-error";

interface RoomParams {
  Params: { id: string };
}

export class RoomController {
  constructor(
    private readonly createRoomUseCase: CreateRoomUseCase,
    private readonly listRoomsUseCase: ListRoomsUseCase,
    private readonly getRoomUseCase: GetRoomUseCase,
    private readonly updateRoomUseCase: UpdateRoomUseCase,
    private readonly deactivateRoomUseCase: DeactivateRoomUseCase,
    private readonly auditLog: AuditLog,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId, userId } = getRequestAuth(request);
    const parsed = CreateRoomSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de sala inválido.",
        parsed.error.issues,
      );
    }

    const room = await this.createRoomUseCase.execute(companyId, parsed.data).catch(mapRoomError);

    await this.auditLog.record({
      companyId,
      actorType: AuditActorType.USER,
      actorUserId: userId,
      action: AuditAction.CREATE,
      resource: AuditResource.ROOM,
      resourceId: room.id,
    });

    return reply.code(201).send(toRoomResponse(room));
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    const filters = parseFilters(request.query as Record<string, unknown>);

    const rooms = await this.listRoomsUseCase.execute(companyId, filters);

    return reply.send(rooms.map(toRoomResponse));
  }

  async getById(request: FastifyRequest<RoomParams>, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);

    const room = await this.getRoomUseCase
      .execute(request.params.id, companyId)
      .catch(mapRoomError);

    return reply.send(toRoomResponse(room));
  }

  async update(request: FastifyRequest<RoomParams>, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId, userId } = getRequestAuth(request);
    const parsed = UpdateRoomSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de sala inválido.",
        parsed.error.issues,
      );
    }

    const room = await this.updateRoomUseCase
      .execute(request.params.id, companyId, parsed.data)
      .catch(mapRoomError);

    await this.auditLog.record({
      companyId,
      actorType: AuditActorType.USER,
      actorUserId: userId,
      action: AuditAction.UPDATE,
      resource: AuditResource.ROOM,
      resourceId: room.id,
      metadata: { fields: Object.keys(parsed.data).sort() },
    });

    return reply.send(toRoomResponse(room));
  }

  async deactivate(
    request: FastifyRequest<RoomParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { companyId, userId } = getRequestAuth(request);

    const room = await this.deactivateRoomUseCase
      .execute(request.params.id, companyId)
      .catch(mapRoomError);

    await this.auditLog.record({
      companyId,
      actorType: AuditActorType.USER,
      actorUserId: userId,
      action: AuditAction.CANCEL,
      resource: AuditResource.ROOM,
      resourceId: room.id,
      metadata: { operation: "deactivate" },
    });

    return reply.send(toRoomResponse(room));
  }
}

function toRoomResponse(room: Room): RoomResponse {
  return {
    id: room.id,
    companyId: room.companyId,
    name: room.name,
    description: room.description,
    capacity: room.capacity,
    hourlyRateInCents: room.hourlyRateInCents,
    amenities: room.amenities,
    photoUrl: room.photoUrl,
    isActive: room.isActive,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

/**
 * Query string chega como texto puro; a coerção para número/boolean acontece
 * aqui, na borda HTTP, antes de validar com o mesmo schema Zod usado no body.
 */
function parseFilters(query: Record<string, unknown>): RoomFiltersInput {
  const raw: Record<string, unknown> = {};

  if (typeof query.minCapacity === "string" && query.minCapacity !== "") {
    raw.minCapacity = Number(query.minCapacity);
  }

  if (typeof query.isActive === "string") {
    raw.isActive = query.isActive === "true";
  }

  const parsed = RoomFiltersSchema.safeParse(raw);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Filtros de listagem inválidos.",
      parsed.error.issues,
    );
  }

  return parsed.data;
}
