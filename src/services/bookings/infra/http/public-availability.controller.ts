import type { FastifyReply, FastifyRequest } from "fastify";
import { getPublicCompany } from "@services/companies/infra/http/resolve-company-slug";
import { AvailabilityQuerySchema } from "@shared/schemas/booking.schema";
import { HttpError } from "@services/http/http-error";
import type { CheckAvailabilityUseCase } from "../../application/check-availability.use-case";
import { mapBookingError } from "./booking-error";

interface AvailabilityRequest {
  Params: { companySlug: string; roomId: string };
  Querystring: { date?: string };
}

/**
 * Passo 2 do wizard: sem sessão, identificado só pelo slug da empresa na URL.
 *
 * O `companyId` já chega resolvido em `request.publicCompany`, preenchido pelo
 * `preHandler` único do plugin `/public/:companySlug` (ver
 * `@services/companies/infra/http/resolve-company-slug`). Sala inexistente, de
 * outra empresa ou inativa respondem o mesmo 404 de `ROOM_NOT_FOUND` - a distinção
 * fica só no domínio, nunca na borda pública, para não transformar o endpoint em
 * oráculo de salas alheias. Ver `docs/architecture.md`.
 */
export class PublicAvailabilityController {
  constructor(private readonly checkAvailabilityUseCase: CheckAvailabilityUseCase) {}

  async availability(
    request: FastifyRequest<AvailabilityRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = AvailabilityQuerySchema.safeParse({
      roomId: request.params.roomId,
      date: request.query.date,
    });

    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Consulta de disponibilidade inválida.",
        parsed.error.issues,
      );
    }

    const company = getPublicCompany(request);

    const availability = await this.checkAvailabilityUseCase
      .execute({ companyId: company.id, roomId: parsed.data.roomId, date: parsed.data.date })
      .catch(mapBookingError);

    return reply.send(availability);
  }
}
