import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { buildServer } from "@services/http/server";
import { createTestDatabase, type TestDatabase } from "./setup/test-database";

/**
 * Suíte MVP-13: prova, numa jornada só, que o caminho ponta a ponta descrito no
 * README (cadastro -> sala -> agenda -> disponibilidade pública -> reserva ->
 * agenda administrativa -> cancelamento) funciona de fato contra o Postgres, e
 * não só em pedaços isolados por endpoint como o resto da suíte e2e cobre.
 *
 * 2031-09-02 é uma terça-feira bem no futuro: a API usa o `SystemClock`, e uma
 * data próxima faria a suíte recusar reservas por já terem começado dependendo
 * da hora em que ela roda.
 */
const TUESDAY_WEEKDAY = 2;
const DATE = "2031-09-02";
const NINE = `${DATE}T09:00:00-03:00`;
const TEN = `${DATE}T10:00:00-03:00`;

interface Tenant {
  cookie: string;
  companyId: string;
  slug: string;
}

let app: FastifyInstance;
let database: TestDatabase;

function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signUpCompany(email: string, slug: string, name: string): Promise<Tenant> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: {
      user: { name: "Bruno Tatsch", email, password: "senha-muito-segura" },
      company: { name, slug, type: "hotel", timezone: "America/Sao_Paulo" },
    },
  });

  return { cookie: cookieHeader(response), companyId: response.json().company.id, slug };
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
  database = createTestDatabase();
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe("fluxo crítico ponta a ponta", () => {
  it("cadastro -> sala -> agenda -> disponibilidade pública -> reserva -> agenda admin -> cancelamento", async () => {
    const hotel = await signUpCompany(
      "critico-hotel@exemplo.com",
      "critico-hotel-aurora",
      "Hotel Aurora",
    );

    const roomResponse = await app.inject({
      method: "POST",
      url: "/api/v1/rooms",
      headers: { cookie: hotel.cookie },
      payload: { name: "Sala Atlântico", capacity: 10, hourlyRateInCents: 12_000 },
    });
    expect(roomResponse.statusCode).toBe(201);
    const roomId = roomResponse.json().id as string;

    const scheduleResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie: hotel.cookie },
      payload: [
        { weekday: TUESDAY_WEEKDAY, opensAt: "09:00:00", closesAt: "12:00:00", slotMinutes: 60 },
      ],
    });
    expect(scheduleResponse.statusCode).toBe(200);

    function availability() {
      return app.inject({
        method: "GET",
        url: `/api/v1/public/${hotel.slug}/rooms/${roomId}/availability?date=${DATE}`,
      });
    }

    const beforeBooking = await availability();
    expect(beforeBooking.statusCode).toBe(200);
    expect(beforeBooking.json().slots[0]).toMatchObject({ startsAt: NINE, available: true });

    const bookingResponse = await app.inject({
      method: "POST",
      url: `/api/v1/public/${hotel.slug}/bookings`,
      payload: {
        roomId,
        startsAt: NINE,
        endsAt: TEN,
        customerName: "Ana Prado",
        customerEmail: "ana@exemplo.com",
      },
    });
    expect(bookingResponse.statusCode).toBe(201);
    const bookingId = bookingResponse.json().id as string;

    const afterBooking = await availability();
    expect(afterBooking.json().slots[0]).toMatchObject({ startsAt: NINE, available: false });

    const agenda = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?date=${DATE}`,
      headers: { cookie: hotel.cookie },
    });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json()).toHaveLength(1);
    expect(agenda.json()).toContainEqual(
      expect.objectContaining({
        id: bookingId,
        roomId,
        customerName: "Ana Prado",
        customerEmail: "ana@exemplo.com",
        status: "confirmed",
      }),
    );

    const coworking = await signUpCompany(
      "critico-coworking@exemplo.com",
      "critico-coworking-sul",
      "Coworking Sul",
    );

    const leakedAgenda = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?date=${DATE}`,
      headers: { cookie: coworking.cookie },
    });
    expect(leakedAgenda.json()).toEqual([]);

    const blockedCancel = await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${bookingId}`,
      headers: { cookie: coworking.cookie },
    });
    expect(blockedCancel.statusCode).toBe(404);

    const [stillConfirmed] = await database.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(stillConfirmed?.status).toBe("confirmed");

    const cancelResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/bookings/${bookingId}`,
      headers: { cookie: hotel.cookie },
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json().status).toBe("cancelled");

    const afterCancel = await availability();
    expect(afterCancel.json().slots[0]).toMatchObject({ startsAt: NINE, available: true });

    const agendaAfterCancel = await app.inject({
      method: "GET",
      url: `/api/v1/bookings?date=${DATE}`,
      headers: { cookie: hotel.cookie },
    });
    expect(agendaAfterCancel.json()).toHaveLength(1);
    expect(agendaAfterCancel.json()).toContainEqual(
      expect.objectContaining({ id: bookingId, status: "cancelled" }),
    );
  });
});
