import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AuditAction,
  AuditActorType,
  AuditResource,
  type AuditLog,
} from "@services/audit/domain/audit-log";
import {
  AdminCreateBookingSchema,
  BookingFiltersSchema,
  CheckInBookingSchema,
  DayBookingFiltersSchema,
  RescheduleBookingSchema,
  WeekBookingFiltersSchema,
} from "@shared/schemas/booking.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { CancelBookingUseCase } from "../../application/cancel-booking.use-case";
import type { CheckInBookingUseCase } from "../../application/check-in-booking.use-case";
import type { CheckOutBookingUseCase } from "../../application/check-out-booking.use-case";
import type { CreateBookingUseCase } from "../../application/create-booking.use-case";
import type { ListBookingsUseCase } from "../../application/list-bookings.use-case";
import type { MarkBookingNoShowUseCase } from "../../application/mark-booking-no-show.use-case";
import type { RescheduleBookingUseCase } from "../../application/reschedule-booking.use-case";
import {
  nextCalendarDate,
  parseCalendarDate,
  weekdayOf,
  zonedTimeToInstant,
} from "../../domain/time-zone";
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
    private readonly createBookingUseCase: CreateBookingUseCase,
    private readonly listBookingsUseCase: ListBookingsUseCase,
    private readonly cancelBookingUseCase: CancelBookingUseCase,
    private readonly rescheduleBookingUseCase: RescheduleBookingUseCase,
    private readonly checkInBookingUseCase: CheckInBookingUseCase,
    private readonly checkOutBookingUseCase: CheckOutBookingUseCase,
    private readonly markBookingNoShowUseCase: MarkBookingNoShowUseCase,
    private readonly auditLog: AuditLog,
  ) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    const timezone = await this.timezoneOf(companyId);
    const query = request.query as Record<string, unknown>;
    const range =
      query.date !== undefined
        ? resolveDayRange(query, timezone)
        : query.weekStart !== undefined
          ? resolveWeekRange(query, timezone)
          : resolveFromToRange(query);

    const bookings = await this.listBookingsUseCase
      .execute({ companyId, from: range.from, to: range.to, roomId: range.roomId })
      .catch(mapBookingError);

    return reply.send(bookings.map((booking) => toBookingResponse(booking, timezone)));
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = AdminCreateBookingSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de reserva manual inválido.",
        parsed.error.issues,
      );
    }

    const { companyId, userId } = getRequestAuth(request);
    const timezone = await this.timezoneOf(companyId);
    const period = resolveWallClockPeriod(
      parsed.data.date,
      parsed.data.startTime,
      parsed.data.endTime,
      timezone,
    );
    const booking = await this.createBookingUseCase
      .execute({
        companyId,
        roomId: parsed.data.roomId,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        customerPhone: parsed.data.customerPhone ?? null,
        notes: parsed.data.notes ?? null,
        confirmationMode: "manual",
      })
      .catch(mapBookingError);

    await this.recordUpdate(companyId, userId, booking.id, AuditAction.CREATE, {
      operation: "manual_create",
    });
    return reply.code(201).send(toBookingResponse(booking, timezone));
  }

  async cancel(request: FastifyRequest<BookingParams>, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId, userId } = getRequestAuth(request);

    const booking = await this.cancelBookingUseCase
      .execute(request.params.id, companyId)
      .catch(mapBookingError);

    await this.auditLog.record({
      companyId,
      actorType: AuditActorType.USER,
      actorUserId: userId,
      action: AuditAction.CANCEL,
      resource: AuditResource.BOOKING,
      resourceId: booking.id,
    });

    return reply.send(toBookingResponse(booking, await this.timezoneOf(companyId)));
  }

  async reschedule(
    request: FastifyRequest<BookingParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = RescheduleBookingSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de reagendamento inválido.",
        parsed.error.issues,
      );
    }

    const { companyId, userId } = getRequestAuth(request);
    const timezone = await this.timezoneOf(companyId);
    const period = resolveWallClockPeriod(
      parsed.data.date,
      parsed.data.startTime,
      parsed.data.endTime,
      timezone,
    );
    const booking = await this.rescheduleBookingUseCase
      .execute({ id: request.params.id, companyId, ...period })
      .catch(mapBookingError);

    await this.recordUpdate(companyId, userId, booking.id, AuditAction.UPDATE, {
      operation: "reschedule",
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
    });
    return reply.send(toBookingResponse(booking, timezone));
  }

  async checkIn(
    request: FastifyRequest<BookingParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = CheckInBookingSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de check-in inválido.",
        parsed.error.issues,
      );
    }

    const { companyId, userId } = getRequestAuth(request);
    const booking = await this.checkInBookingUseCase
      .execute(request.params.id, companyId, parsed.data.confirmOutsideWindow)
      .catch(mapBookingError);
    await this.recordUpdate(companyId, userId, booking.id, AuditAction.UPDATE, {
      operation: "check_in",
      confirmedOutsideWindow: parsed.data.confirmOutsideWindow,
    });
    return reply.send(toBookingResponse(booking, await this.timezoneOf(companyId)));
  }

  async checkOut(
    request: FastifyRequest<BookingParams>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { companyId, userId } = getRequestAuth(request);
    const booking = await this.checkOutBookingUseCase
      .execute(request.params.id, companyId)
      .catch(mapBookingError);
    await this.recordUpdate(companyId, userId, booking.id, AuditAction.UPDATE, {
      operation: "check_out",
    });
    return reply.send(toBookingResponse(booking, await this.timezoneOf(companyId)));
  }

  async noShow(request: FastifyRequest<BookingParams>, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId, userId } = getRequestAuth(request);
    const booking = await this.markBookingNoShowUseCase
      .execute(request.params.id, companyId)
      .catch(mapBookingError);
    await this.recordUpdate(companyId, userId, booking.id, AuditAction.UPDATE, {
      operation: "no_show",
    });
    return reply.send(toBookingResponse(booking, await this.timezoneOf(companyId)));
  }

  private recordUpdate(
    companyId: string,
    userId: string,
    bookingId: string,
    action: typeof AuditAction.CREATE | typeof AuditAction.UPDATE,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      companyId,
      actorType: AuditActorType.USER,
      actorUserId: userId,
      action,
      resource: AuditResource.BOOKING,
      resourceId: bookingId,
      metadata,
    });
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

  return {
    from: new Date(parsed.data.from),
    to: new Date(parsed.data.to),
    roomId: parsed.data.roomId,
  };
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
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `date "${parsed.data.date}" não existe no calendário.`,
    );
  }

  return {
    from: zonedTimeToInstant(timezone, date, 0),
    to: zonedTimeToInstant(timezone, nextCalendarDate(date), 0),
    roomId: parsed.data.roomId,
  };
}

function resolveWeekRange(query: Record<string, unknown>, timezone: string): BookingRange {
  const parsed = WeekBookingFiltersSchema.safeParse({
    weekStart: query.weekStart,
    ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
  });
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Filtro de semana inválido.", parsed.error.issues);
  }

  const first = parseCalendarDate(parsed.data.weekStart);
  if (!first || weekdayOf(first) !== 1) {
    throw new HttpError(400, "VALIDATION_ERROR", "weekStart deve ser uma segunda-feira válida.");
  }
  let afterLast = first;
  for (let day = 0; day < 7; day += 1) afterLast = nextCalendarDate(afterLast);

  return {
    from: zonedTimeToInstant(timezone, first, 0),
    to: zonedTimeToInstant(timezone, afterLast, 0),
    roomId: parsed.data.roomId,
  };
}

function resolveWallClockPeriod(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
) {
  const calendarDate = parseCalendarDate(date);
  if (!calendarDate) throw new HttpError(400, "VALIDATION_ERROR", `date "${date}" inválida.`);

  return {
    startsAt: zonedTimeToInstant(timezone, calendarDate, timeToMinutes(startTime)),
    endsAt: zonedTimeToInstant(timezone, calendarDate, timeToMinutes(endTime)),
  };
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}
