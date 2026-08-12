import type { FastifyReply, FastifyRequest } from "fastify";
import { getPublicCompany } from "@services/companies/infra/http/resolve-company-slug";
import { CreateBookingSchema } from "@shared/schemas/booking.schema";
import { HttpError } from "@services/http/http-error";
import type { CreateBookingUseCase } from "../../application/create-booking.use-case";
import { mapBookingError } from "./booking-error";
import { toBookingResponse } from "./booking-response";

/**
 * Passo 4 do wizard: quem reserva não tem conta, então o tenant vem do slug da URL.
 *
 * O `companyId` já chega resolvido em `request.publicCompany`, preenchido pelo
 * `preHandler` único do plugin `/public/:companySlug` (ver
 * `@services/companies/infra/http/resolve-company-slug`). Nenhum campo do corpo
 * escolhe empresa ou preço.
 */
export class PublicBookingController {
  constructor(private readonly createBookingUseCase: CreateBookingUseCase) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = CreateBookingSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de reserva inválido.",
        parsed.error.issues,
      );
    }

    const company = getPublicCompany(request);

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
