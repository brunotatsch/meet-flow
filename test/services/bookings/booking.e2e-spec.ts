import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BookingResponseSchema } from "@shared/schemas/booking.schema";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { buildServer } from "@services/http/server";
import { createTestDatabase, type TestDatabase } from "../setup/test-database";

/**
 * 2030-06-04 é uma terça-feira bem no futuro: a API usa o `SystemClock`, e uma data
 * próxima faria a suíte recusar reservas por já terem começado dependendo da hora em
 * que ela roda. A sala abre das 09:00 às 12:00 em São Paulo (UTC-3), grade de 60
 * minutos, o que em UTC vira 12:00Z-15:00Z.
 */
const TUESDAY_WEEKDAY = 2;
const NINE = "2030-06-04T09:00:00-03:00";
const TEN = "2030-06-04T10:00:00-03:00";
const ELEVEN = "2030-06-04T11:00:00-03:00";
const NOON = "2030-06-04T12:00:00-03:00";
const DAY_START = "2030-06-04T00:00:00-03:00";
const DAY_END = "2030-06-05T00:00:00-03:00";

interface Tenant {
  cookie: string;
  companyId: string;
  slug: string;
  roomId: string;
}

let app: FastifyInstance;
let database: TestDatabase;
let hotel: Tenant;
let coworking: Tenant;

function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function createTenant(input: {
  email: string;
  slug: string;
  hourlyRateInCents?: number;
}): Promise<Tenant> {
  const signUp = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: {
      user: { name: "Bruno Tatsch", email: input.email, password: "senha-muito-segura" },
      company: {
        name: "Hotel Reservas",
        slug: input.slug,
        type: "hotel",
        timezone: "America/Sao_Paulo",
      },
    },
  });

  const cookie = cookieHeader(signUp);
  const companyId = signUp.json().company.id as string;

  const room = await app.inject({
    method: "POST",
    url: "/api/v1/rooms",
    headers: { cookie },
    payload: {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: input.hourlyRateInCents ?? 12_000,
    },
  });
  const roomId = room.json().id as string;

  await app.inject({
    method: "PUT",
    url: `/api/v1/rooms/${roomId}/schedules`,
    headers: { cookie },
    payload: [
      { weekday: TUESDAY_WEEKDAY, opensAt: "09:00:00", closesAt: "12:00:00", slotMinutes: 60 },
    ],
  });

  return { cookie, companyId, slug: input.slug, roomId };
}

function bookingPayload(
  tenant: Tenant,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    roomId: tenant.roomId,
    startsAt: NINE,
    endsAt: TEN,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    ...overrides,
  };
}

function book(tenant: Tenant, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/v1/public/${tenant.slug}/bookings`,
    payload: bookingPayload(tenant, overrides),
  });
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
  database = createTestDatabase();

  hotel = await createTenant({ email: "reservas-hotel@exemplo.com", slug: "reservas-hotel" });
  coworking = await createTenant({
    email: "reservas-coworking@exemplo.com",
    slug: "reservas-coworking",
  });
});

beforeEach(async () => {
  await database.client.unsafe("DELETE FROM bookings");
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe("POST /api/v1/public/:companySlug/bookings", () => {
  it("cria a reserva sem sessão, no formato do contrato compartilhado", async () => {
    const response = await book(hotel);

    expect(response.statusCode).toBe(201);
    expect(() => BookingResponseSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      companyId: hotel.companyId,
      roomId: hotel.roomId,
      customerName: "Ana Prado",
      status: "confirmed",
      startsAt: NINE,
      endsAt: TEN,
    });

    const [row] = await database.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, response.json().id));

    expect(row?.companyId).toBe(hotel.companyId);
    expect(row?.status).toBe("confirmed");
  });

  it("calcula total_in_cents no servidor e ignora o preço enviado no corpo", async () => {
    const response = await book(hotel, { endsAt: ELEVEN, totalInCents: 1 });

    expect(response.statusCode).toBe(201);
    expect(response.json().totalInCents).toBe(24_000);

    const [row] = await database.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, response.json().id));

    expect(row?.totalInCents).toBe(24_000);
  });

  it("ignora companyId e status enviados no corpo", async () => {
    const response = await book(hotel, {
      companyId: coworking.companyId,
      status: "cancelled",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      companyId: hotel.companyId,
      status: "confirmed",
    });
  });

  it("devolve 409 quando o horário já está reservado", async () => {
    await book(hotel);

    const response = await book(hotel);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("BOOKING_CONFLICT");
  });

  it("aceita reserva encostada na anterior, pelo intervalo semiaberto", async () => {
    await book(hotel);

    const response = await book(hotel, { startsAt: TEN, endsAt: ELEVEN });

    expect(response.statusCode).toBe(201);
  });

  it("devolve 422 para horário fora da janela de funcionamento", async () => {
    const response = await book(hotel, { startsAt: NOON, endsAt: "2030-06-04T13:00:00-03:00" });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("OUTSIDE_BUSINESS_HOURS");
  });

  it("devolve 422 para dia sem agenda cadastrada", async () => {
    const response = await book(hotel, {
      startsAt: "2030-06-05T09:00:00-03:00",
      endsAt: "2030-06-05T10:00:00-03:00",
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("OUTSIDE_BUSINESS_HOURS");
  });

  it("devolve 422 para horário que não cai na grade", async () => {
    const response = await book(hotel, {
      startsAt: "2030-06-04T09:30:00-03:00",
      endsAt: "2030-06-04T10:30:00-03:00",
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("SLOT_NOT_ALIGNED");
  });

  it("devolve 422 para horário no passado", async () => {
    const response = await book(hotel, {
      startsAt: "2020-06-02T09:00:00-03:00",
      endsAt: "2020-06-02T10:00:00-03:00",
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("BOOKING_IN_THE_PAST");
  });

  it("devolve 400 para payload inválido", async () => {
    const response = await book(hotel, { customerEmail: "nao-e-email" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("devolve 404 para empresa inexistente e para sala de outra empresa", async () => {
    const unknownCompany = await app.inject({
      method: "POST",
      url: "/api/v1/public/nao-existe/bookings",
      payload: bookingPayload(hotel),
    });

    const foreignRoom = await book(hotel, { roomId: coworking.roomId });

    expect(unknownCompany.statusCode).toBe(404);
    expect(unknownCompany.json().code).toBe("COMPANY_NOT_FOUND");
    expect(foreignRoom.statusCode).toBe(404);
    expect(foreignRoom.json().code).toBe("ROOM_NOT_FOUND");
  });

  it("devolve 404 e não revela que a sala existe quando ela está inativa", async () => {
    await app.inject({
      method: "DELETE",
      url: `/api/v1/rooms/${coworking.roomId}`,
      headers: { cookie: coworking.cookie },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/public/${coworking.slug}/bookings`,
      payload: bookingPayload(coworking),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "ROOM_NOT_FOUND",
      message: "Sala não encontrada.",
    });

    /** Reativa para as specs seguintes; a asserção evita que a limpeza falhe calada. */
    const reactivated = await app.inject({
      method: "PATCH",
      url: `/api/v1/rooms/${coworking.roomId}`,
      headers: { cookie: coworking.cookie },
      payload: { isActive: true },
    });

    expect(reactivated.json().isActive).toBe(true);
  });
});

/**
 * O teste que justifica a issue: a invariante contra double-booking é do banco, e é
 * só sob concorrência real que dá para provar isso.
 *
 * Uma verificação de disponibilidade antes do insert passaria em qualquer teste
 * sequencial e falharia exatamente aqui, porque as N requisições leriam a sala livre
 * antes de qualquer uma delas gravar. Quem arbitra é `bookings_no_overlap`; a
 * aplicação só traduz o `23P01` em 409.
 */
describe("concorrência no mesmo horário", () => {
  const ATTEMPTS = 12;

  it("cria exatamente uma reserva e responde 409 nas demais, sem 500", async () => {
    const responses = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, index) =>
        book(hotel, { customerEmail: `cliente-${index}@exemplo.com` }),
      ),
    );

    const statuses = responses.map((response) => response.statusCode);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(ATTEMPTS - 1);
    expect(statuses.filter((status) => status >= 500)).toHaveLength(0);

    for (const response of responses.filter((candidate) => candidate.statusCode === 409)) {
      expect(response.json().code).toBe("BOOKING_CONFLICT");
    }

    const rows = await database.db.select().from(bookings);
    expect(rows).toHaveLength(1);
  });

  it("não serializa reservas de horários diferentes na mesma sala", async () => {
    const responses = await Promise.all([
      book(hotel, { startsAt: NINE, endsAt: TEN }),
      book(hotel, { startsAt: TEN, endsAt: ELEVEN }),
      book(hotel, { startsAt: ELEVEN, endsAt: NOON }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201]);
  });
});

describe("GET /api/v1/bookings", () => {
  it("responde 401 sem sessão", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?from=${encodeURIComponent(DAY_START)}&to=${encodeURIComponent(DAY_END)}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it("lista as reservas da empresa autenticada dentro do período", async () => {
    await book(hotel);
    /** A reserva do outro tenant existe de verdade: é ela que o filtro precisa esconder. */
    expect((await book(coworking)).statusCode).toBe(201);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?from=${encodeURIComponent(DAY_START)}&to=${encodeURIComponent(DAY_END)}`,
      headers: { cookie: hotel.cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ companyId: hotel.companyId, startsAt: NINE });
    expect(() => BookingResponseSchema.parse(body[0])).not.toThrow();
  });

  it("filtra por sala e recorta pelo período", async () => {
    await book(hotel);
    await book(hotel, { startsAt: ELEVEN, endsAt: NOON });

    const byRoom = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?from=${encodeURIComponent(DAY_START)}&to=${encodeURIComponent(DAY_END)}&roomId=${hotel.roomId}`,
      headers: { cookie: hotel.cookie },
    });

    const earlySlice = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?from=${encodeURIComponent(NINE)}&to=${encodeURIComponent(TEN)}`,
      headers: { cookie: hotel.cookie },
    });

    expect(byRoom.json()).toHaveLength(2);
    expect(earlySlice.json()).toHaveLength(1);
  });

  it("devolve 400 sem período ou com período invertido", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/bookings",
      headers: { cookie: hotel.cookie },
    });

    const inverted = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?from=${encodeURIComponent(DAY_END)}&to=${encodeURIComponent(DAY_START)}`,
      headers: { cookie: hotel.cookie },
    });

    expect(missing.statusCode).toBe(400);
    expect(inverted.statusCode).toBe(400);
  });
});

/**
 * MVP-12: alternativa a `from`/`to` pensada para a agenda diária do admin - o
 * cliente manda só a data de calendário, sem calcular offset nem virada de
 * horário de verão na mão.
 */
describe("GET /api/v1/bookings?date=", () => {
  it("lista as reservas do dia da empresa autenticada, sem vazar a de outro tenant", async () => {
    await book(hotel);
    expect((await book(coworking)).statusCode).toBe(201);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=2030-06-04",
      headers: { cookie: hotel.cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ companyId: hotel.companyId, startsAt: NINE });
  });

  it("recorta pela data pedida, ignorando reservas de outros dias", async () => {
    await book(hotel);

    const sameDay = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=2030-06-04",
      headers: { cookie: hotel.cookie },
    });
    const otherDay = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=2030-06-05",
      headers: { cookie: hotel.cookie },
    });

    expect(sameDay.json()).toHaveLength(1);
    expect(otherDay.json()).toHaveLength(0);
  });

  it("combina com roomId", async () => {
    await book(hotel);
    await book(hotel, { startsAt: ELEVEN, endsAt: NOON });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?date=2030-06-04&roomId=${hotel.roomId}`,
      headers: { cookie: hotel.cookie },
    });

    expect(response.json()).toHaveLength(2);
  });

  it("devolve 400 para data malformada ou inexistente no calendário", async () => {
    const malformed = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=04-06-2030",
      headers: { cookie: hotel.cookie },
    });
    const nonexistent = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=2030-02-30",
      headers: { cookie: hotel.cookie },
    });

    expect(malformed.statusCode).toBe(400);
    expect(nonexistent.statusCode).toBe(400);
  });

  /**
   * A reserva que cruza a virada do dia aparece nos dois dias que ela toca: é a
   * mesma semântica de sobreposição que `listActivePeriods` já usa no motor de
   * disponibilidade, e é o que faz uma reserva das 23h à 1h não desaparecer da
   * agenda de nenhum dos dois dias que ela ocupa de verdade.
   */
  it("uma reserva que cruza a meia-noite aparece nos dois dias que ela toca", async () => {
    await database.db.insert(bookings).values({
      companyId: hotel.companyId,
      roomId: hotel.roomId,
      customerName: "Ana Prado",
      customerEmail: "ana@exemplo.com",
      startsAt: new Date("2030-06-04T23:00:00-03:00"),
      endsAt: new Date("2030-06-05T01:00:00-03:00"),
      status: "confirmed",
      totalInCents: 24_000,
    });

    const firstDay = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=2030-06-04",
      headers: { cookie: hotel.cookie },
    });
    const secondDay = await app.inject({
      method: "GET",
      url: "/api/v1/bookings?date=2030-06-05",
      headers: { cookie: hotel.cookie },
    });

    expect(firstDay.json()).toHaveLength(1);
    expect(secondDay.json()).toHaveLength(1);
    expect(firstDay.json()[0].id).toBe(secondDay.json()[0].id);
  });
});

describe("DELETE /api/v1/bookings/:id", () => {
  it("responde 401 sem sessão", async () => {
    const created = await book(hotel);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${created.json().id}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it("cancela a reserva e libera o horário para uma nova", async () => {
    const created = await book(hotel);
    expect((await book(hotel)).statusCode).toBe(409);

    const cancelled = await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${created.json().id}`,
      headers: { cookie: hotel.cookie },
    });

    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe("cancelled");
    expect((await book(hotel)).statusCode).toBe(201);
  });

  it("mantém a reserva cancelada no histórico", async () => {
    const created = await book(hotel);
    await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${created.json().id}`,
      headers: { cookie: hotel.cookie },
    });

    const [row] = await database.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, created.json().id));

    expect(row?.status).toBe("cancelled");
  });

  it("devolve 404 para reserva de outra empresa", async () => {
    const created = await book(hotel);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${created.json().id}`,
      headers: { cookie: coworking.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("BOOKING_NOT_FOUND");
  });
});

describe("integração com a grade de disponibilidade", () => {
  it("marca como indisponível o slot reservado e o libera após o cancelamento", async () => {
    const created = await book(hotel);

    const busy = await app.inject({
      method: "GET",
      url: `/api/v1/public/${hotel.slug}/rooms/${hotel.roomId}/availability?date=2030-06-04`,
    });

    expect(busy.json().slots[0]).toMatchObject({ startsAt: NINE, available: false });

    await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${created.json().id}`,
      headers: { cookie: hotel.cookie },
    });

    const free = await app.inject({
      method: "GET",
      url: `/api/v1/public/${hotel.slug}/rooms/${hotel.roomId}/availability?date=2030-06-04`,
    });

    expect(free.json().slots[0]).toMatchObject({ startsAt: NINE, available: true });
  });
});
