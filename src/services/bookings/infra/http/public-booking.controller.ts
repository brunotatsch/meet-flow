import type { FastifyReply, FastifyRequest } from "fastify";
import { CreateBookingSchema } from "@shared/schemas/booking.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { HttpError } from "@services/http/http-error";
import type { CreateBookingUseCase } from "../../application/create-booking.use-case";
import { mapBookingError } from "./booking-error";
import { toBookingResponse } from "./booking-response";

interface CreateBookingRequest {
  Params: { companySlug: string };
}

/**
 * Passo 4 do wizard: quem reserva não tem conta, então o tenant vem do slug da URL.
 *
 * É a mesma exceção documentada para a rota de disponibilidade, e vale só aqui: o
 * slug é resolvido para um `companyId` no banco e a partir daí toda a operação segue
 * filtrada por esse id. Nenhum campo do corpo escolhe empresa ou preço.
 */
export class PublicBookingController {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly createBookingUseCase: CreateBookingUseCase,
  ) {}

  async create(
    request: FastifyRequest<CreateBookingRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = CreateBookingSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de reserva inválido.",
        parsed.error.issues,
      );
    }

    const company = await this.companyRepository.findBySlug(request.params.companySlug);

    if (!company) {
      throw new HttpError(404, "COMPANY_NOT_FOUND", "Empresa não encontrada.");
    }

    const booking = await this.createBookingUseCase
      .execute({
        companyId: company.id,
        roomId: parsed.data.roomId,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        customerPhone: parsed.data.customerPhone ?? null,
        notes: parsed.data.notes ?? null,
      })
      .catch(mapBookingError);

    return reply.code(201).send(toBookingResponse(booking, company.timezone));
  }
}
