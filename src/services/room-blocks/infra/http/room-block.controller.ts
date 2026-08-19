import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CreateRoomBlockSchema,
  DeleteRoomBlockQuerySchema,
  RoomBlockFiltersSchema,
  type RoomBlockResponse,
} from "@shared/schemas/room-block.schema";
import {
  AuditAction,
  AuditActorType,
  AuditResource,
  type AuditLog,
} from "@services/audit/domain/audit-log";
import { formatIsoWithOffset } from "@services/bookings/domain/time-zone";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { CreateRoomBlocksUseCase } from "../../application/create-room-blocks.use-case";
import type { DeleteRoomBlockUseCase } from "../../application/delete-room-block.use-case";
import type { ListRoomBlocksUseCase } from "../../application/list-room-blocks.use-case";
import type { RoomBlock } from "../../domain/room-block.entity";
import { mapRoomBlockError } from "./room-block-error";

interface ListRequest {
  Querystring: { from?: string; to?: string; roomId?: string };
}

interface DeleteRequest {
  Params: { id: string };
  Querystring: { scope?: string };
}

export class RoomBlockController {
  constructor(
    private readonly createRoomBlocks: CreateRoomBlocksUseCase,
    private readonly listRoomBlocks: ListRoomBlocksUseCase,
    private readonly deleteRoomBlock: DeleteRoomBlockUseCase,
    private readonly auditLog: AuditLog,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const auth = getRequestAuth(request);
    const parsed = CreateRoomBlockSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Bloqueio de sala inválido.",
        parsed.error.issues,
      );
    }

    const result = await this.createRoomBlocks
      .execute({ companyId: auth.companyId, createdBy: auth.userId, ...parsed.data })
      .catch(mapRoomBlockError);
    const first = result.blocks[0];
    if (!first) throw new Error("CreateRoomBlocksUseCase devolveu uma série vazia.");

    await this.auditLog.record({
      companyId: auth.companyId,
      actorType: AuditActorType.USER,
      actorUserId: auth.userId,
      action: AuditAction.CREATE,
      resource: AuditResource.ROOM_BLOCK,
      resourceId: first.id,
      metadata: {
        roomId: first.roomId,
        recurrenceGroupId: first.recurrenceGroupId,
        occurrences: result.blocks.length,
        reason: first.reason,
      },
    });

    return reply.code(201).send({
      timezone: result.timezone,
      items: result.blocks.map((block) => toResponse(block, result.timezone)),
    });
  }

  async list(request: FastifyRequest<ListRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    const parsed = RoomBlockFiltersSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Período de bloqueios inválido.",
        parsed.error.issues,
      );
    }

    const result = await this.listRoomBlocks
      .execute({
        companyId,
        roomId: parsed.data.roomId,
        from: new Date(parsed.data.from),
        to: new Date(parsed.data.to),
      })
      .catch(mapRoomBlockError);

    return reply.send({
      timezone: result.timezone,
      items: result.blocks.map((block) => toResponse(block, result.timezone)),
    });
  }

  async delete(request: FastifyRequest<DeleteRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const auth = getRequestAuth(request);
    const parsed = DeleteRoomBlockQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Escopo de remoção inválido.",
        parsed.error.issues,
      );
    }

    const deleted = await this.deleteRoomBlock
      .execute(request.params.id, auth.companyId, parsed.data.scope)
      .catch(mapRoomBlockError);
    const first = deleted[0];
    if (!first) throw new Error("DeleteRoomBlockUseCase devolveu uma remoção vazia.");

    await this.auditLog.record({
      companyId: auth.companyId,
      actorType: AuditActorType.USER,
      actorUserId: auth.userId,
      action: AuditAction.DELETE,
      resource: AuditResource.ROOM_BLOCK,
      resourceId: first.id,
      metadata: {
        roomId: first.roomId,
        scope: parsed.data.scope,
        deletedIds: deleted.map((block) => block.id),
        recurrenceGroupId: first.recurrenceGroupId,
      },
    });

    return reply.code(204).send();
  }
}

function toResponse(block: RoomBlock, timezone: string): RoomBlockResponse {
  return {
    id: block.id,
    companyId: block.companyId,
    roomId: block.roomId,
    startsAt: formatIsoWithOffset(block.startsAt, timezone),
    endsAt: formatIsoWithOffset(block.endsAt, timezone),
    reason: block.reason,
    createdBy: block.createdBy,
    recurrenceGroupId: block.recurrenceGroupId,
    createdAt: block.createdAt.toISOString(),
  };
}
