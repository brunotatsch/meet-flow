import type { FastifyReply, FastifyRequest } from "fastify";
import { getPublicCompany } from "@services/companies/infra/http/resolve-company-slug";
import type { PublicRoomResponse } from "@shared/schemas/room.schema";
import type { ListRoomsUseCase } from "../../application/list-rooms.use-case";
import type { Room } from "../../domain/room.entity";

/**
 * Passo 1 do wizard: só salas ativas, com o recorte mínimo de campos do contrato
 * público. `companyId`, `isActive`, `createdAt` e `updatedAt` nunca saem daqui -
 * são detalhe de implementação do admin, não do wizard.
 */
export class PublicRoomController {
  constructor(private readonly listRoomsUseCase: ListRoomsUseCase) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const company = getPublicCompany(request);

    const rooms = await this.listRoomsUseCase.execute(company.id, { isActive: true });

    return reply.send(rooms.map(toPublicRoomResponse));
  }
}

function toPublicRoomResponse(room: Room): PublicRoomResponse {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    capacity: room.capacity,
    hourlyRateInCents: room.hourlyRateInCents,
    amenities: room.amenities,
    photoUrl: room.photoUrl,
  };
}
