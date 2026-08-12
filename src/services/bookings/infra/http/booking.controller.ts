import type { FastifyReply, FastifyRequest } from "fastify";
import {
  BookingFiltersSchema,
  type BookingFilters as BookingFiltersInput,
} from "@shared/schemas/booking.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { CancelBookingUseCase } from "../../application/cancel-booking.use-case";
import type { ListBookingsUseCase } from "../../application/list-bookings.use-case";
import { mapBookingError } from "./booking-error";
import { toBookingResponse } from "./booking-response";

interface BookingParams {
  Params: { id: string };
}

/**
 * Rotas do admin. Diferente do fluxo público, o tenant vem de `request.auth`, e é
 * ele que impede uma empresa de listar ou cancelar a reserva de outra: `companyId`
 * entra em todas as queries, então a reserva de outro tenant simplesmente não é
 * encontrada e responde 404.
 */
export class BookingController {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly listBookingsUseCase: ListBookingsUseCase,
    private readonly cancelBookingUseCase: CancelBookingUseCase,
  ) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    const filters = parseFilters(request.query as Record<string, unknown>);

    const bookings = await this.listBookingsUseCase
      .execute({
        companyId,
        from: new Date(filters.from),
        to: new Date(filters.to),
        roomId: filters.roomId,
      })
      .catch(mapBookingError);

    const timezone = await this.timezoneOf(companyId);

    return reply.send(bookings.map((booking) => toBookingResponse(booking, timezone)));
  }

  async cancel(request: FastifyRequest<BookingParams>, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);

    const booking = await this.cancelBookingUseCase
      .execute(request.params.id, companyId)
      .catch(mapBookingError);

    return reply.send(toBookingResponse(booking, await this.timezoneOf(companyId)));
  }

  /**
   * O fuso vem da empresa da sessão, não da reserva: é ele que define o horário de
   * parede da sala, e é nele que a resposta é serializada.
   *
   * A ausência aqui não é erro do cliente: `requireAuth` resolveu o `companyId` a
   * partir de um join com `companies`, então a linha existia uma consulta atrás.
   * Cair aqui é bug ou corrida com uma exclusão, e vira 500 no handler global.
   */
  private async timezoneOf(companyId: string): Promise<string> {
    const company = await this.companyRepository.findById(companyId);

    if (!company) {
      throw new Error(`Empresa ${companyId} da sessão não foi encontrada.`);
    }

    return company.timezone;
  }
}

/** Query string chega como texto puro; a validação é o mesmo schema Zod do contrato. */
function parseFilters(query: Record<string, unknown>): BookingFiltersInput {
  const parsed = BookingFiltersSchema.safeParse({
    from: query.from,
    to: query.to,
    ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
  });

  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Filtros de listagem de reservas inválidos.",
      parsed.error.issues,
    );
  }

  return parsed.data;
}
