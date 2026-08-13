import type { FastifyReply, FastifyRequest } from "fastify";
import { BookingFiltersSchema, DayBookingFiltersSchema } from "@shared/schemas/booking.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { CancelBookingUseCase } from "../../application/cancel-booking.use-case";
import type { ListBookingsUseCase } from "../../application/list-bookings.use-case";
import { nextCalendarDate, parseCalendarDate, zonedTimeToInstant } from "../../domain/time-zone";
import { mapBookingError } from "./booking-error";
import { toBookingResponse } from "./booking-response";

interface BookingRange {
  from: Date;
  to: Date;
  roomId?: string;
}

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
    const timezone = await this.timezoneOf(companyId);
    const query = request.query as Record<string, unknown>;
    const range = query.date !== undefined ? resolveDayRange(query, timezone) : resolveFromToRange(query);

    const bookings = await this.listBookingsUseCase
      .execute({ companyId, from: range.from, to: range.to, roomId: range.roomId })
      .catch(mapBookingError);

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
function resolveFromToRange(query: Record<string, unknown>): BookingRange {
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

  return { from: new Date(parsed.data.from), to: new Date(parsed.data.to), roomId: parsed.data.roomId };
}

/**
 * Recorte de um dia de calendário só, na agenda diária do admin (MVP-12).
 *
 * `date` vem sem fuso - é o `timezone` da empresa da sessão, já resolvido pelo
 * chamador, que decide onde o dia começa e termina. O mesmo `zonedTimeToInstant`
 * usado pelo motor de disponibilidade para abrir e fechar a janela de uma sala.
 */
function resolveDayRange(query: Record<string, unknown>, timezone: string): BookingRange {
  const parsed = DayBookingFiltersSchema.safeParse({
    date: query.date,
    ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
  });

  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Filtro de dia inválido.", parsed.error.issues);
  }

  const date = parseCalendarDate(parsed.data.date);

  if (!date) {
    throw new HttpError(400, "VALIDATION_ERROR", `date "${parsed.data.date}" não existe no calendário.`);
  }

  return {
    from: zonedTimeToInstant(timezone, date, 0),
    to: zonedTimeToInstant(timezone, nextCalendarDate(date), 0),
    roomId: parsed.data.roomId,
  };
}
