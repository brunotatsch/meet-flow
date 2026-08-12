import type { FastifyReply, FastifyRequest } from "fastify";
import { AvailabilityQuerySchema } from "@shared/schemas/booking.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { HttpError } from "@services/http/http-error";
import type { CheckAvailabilityUseCase } from "../../application/check-availability.use-case";
import { mapBookingError } from "./booking-error";

interface AvailabilityRequest {
  Params: { companySlug: string; roomId: string };
  Querystring: { date?: string };
}

/**
 * Fluxo público do wizard: sem sessão, identificado só pelo slug da empresa na URL.
 *
 * O slug é a única identificação de tenant aceita do cliente em todo o backend, e
 * ela vale exclusivamente aqui. A partir dele resolvemos o `companyId` no banco e
 * toda a consulta segue filtrada por esse id - o cliente nunca escolhe o tenant de
 * uma rota autenticada. Ver `docs/architecture.md`.
 */
export class PublicAvailabilityController {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly checkAvailabilityUseCase: CheckAvailabilityUseCase,
  ) {}

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

    const company = await this.companyRepository.findBySlug(request.params.companySlug);

    /**
     * Empresa inexistente e sala inexistente respondem o mesmo 404 de recursos
     * distintos, mas nenhuma das duas revela se a outra existe: quem varre slugs
     * não consegue distinguir "empresa não existe" de "empresa existe e a sala não".
     */
    if (!company) {
      throw new HttpError(404, "COMPANY_NOT_FOUND", "Empresa não encontrada.");
    }

    const availability = await this.checkAvailabilityUseCase
      .execute({ companyId: company.id, roomId: parsed.data.roomId, date: parsed.data.date })
      .catch(mapBookingError);

    return reply.send(availability);
  }
}
