import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AvailabilityResponseSchema } from "@shared/schemas/booking.schema";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { buildServer } from "@services/http/server";
import { createTestDatabase, type TestDatabase } from "../setup/test-database";

/**
 * Datas bem no futuro: o endpoint público usa o `SystemClock`, e uma data próxima
 * faria a suíte apagar slots por já terem começado dependendo da hora em que roda.
 * 2030-06-04 é terça; 2030-03-10 e 2030-11-03 são os domingos em que o relógio de
 * Nova York adianta e atrasa.
 */
const TUESDAY = "2030-06-04";
const TUESDAY_WEEKDAY = 2;
const WEDNESDAY = "2030-06-05";
const SPRING_FORWARD = "2030-03-10";
const FALL_BACK = "2030-11-03";

let app: FastifyInstance;
let database: TestDatabase;
let brasilia: Tenant;
let newYork: Tenant;

interface Tenant {
  cookie: string;
  companyId: string;
  slug: string;
  roomId: string;
}

function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function createTenant(input: {
  email: string;
  slug: string;
  timezone: string;
  schedules: unknown[];
}): Promise<Tenant> {
  const signUp = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: {
      user: { name: "Bruno Tatsch", email: input.email, password: "senha-muito-segura" },
      company: {
        name: "Hotel Disponibilidade",
        slug: input.slug,
        type: "hotel",
        timezone: input.timezone,
      },
    },
  });

  const cookie = cookieHeader(signUp);
  const companyId = signUp.json().company.id as string;

  const room = await app.inject({
    method: "POST",
    url: "/api/v1/rooms",
    headers: { cookie },
    payload: { name: "Sala Atlântico", capacity: 10, hourlyRateInCents: 12_000 },
  });
  const roomId = room.json().id as string;

  await app.inject({
    method: "PUT",
    url: `/api/v1/rooms/${roomId}/schedules`,
    headers: { cookie },
    payload: input.schedules,
  });

  return { cookie, companyId, slug: input.slug, roomId };
}

function availability(tenant: Pick<Tenant, "slug" | "roomId">, date: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/public/${tenant.slug}/rooms/${tenant.roomId}/availability?date=${date}`,
  });
}

async function book(
  tenant: Tenant,
  startsAt: string,
  endsAt: string,
  status: "pending" | "confirmed" | "cancelled" = "confirmed",
): Promise<void> {
  await database.db.insert(bookings).values({
    companyId: tenant.companyId,
    roomId: tenant.roomId,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status,
    totalInCents: 12_000,
  });
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
  database = createTestDatabase();

  brasilia = await createTenant({
    email: "disponibilidade-sp@exemplo.com",
    slug: "disponibilidade-sp",
    timezone: "America/Sao_Paulo",
    schedules: [
      { weekday: TUESDAY_WEEKDAY, opensAt: "09:00:00", closesAt: "12:00:00", slotMinutes: 60 },
    ],
  });

  newYork = await createTenant({
    email: "disponibilidade-ny@exemplo.com",
    slug: "disponibilidade-ny",
    timezone: "America/New_York",
    schedules: [{ weekday: 0, opensAt: "00:00:00", closesAt: "06:00:00", slotMinutes: 60 }],
  });
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe("GET /api/v1/public/:companySlug/rooms/:roomId/availability", () => {
  it("responde sem sessão, no formato do contrato compartilhado", async () => {
    const response = await availability(brasilia, TUESDAY);

    expect(response.statusCode).toBe(200);
    expect(() => AvailabilityResponseSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      roomId: brasilia.roomId,
      date: TUESDAY,
      timezone: "America/Sao_Paulo",
    });
  });

  it("monta a grade no fuso da empresa, com preço proporcional ao slot", async () => {
    const response = await availability(brasilia, TUESDAY);

    expect(response.json().slots).toEqual([
      {
        startsAt: "2030-06-04T09:00:00-03:00",
        endsAt: "2030-06-04T10:00:00-03:00",
        available: true,
        priceInCents: 12_000,
      },
      {
        startsAt: "2030-06-04T10:00:00-03:00",
        endsAt: "2030-06-04T11:00:00-03:00",
        available: true,
        priceInCents: 12_000,
      },
      {
        startsAt: "2030-06-04T11:00:00-03:00",
        endsAt: "2030-06-04T12:00:00-03:00",
        available: true,
        priceInCents: 12_000,
      },
    ]);
  });

  it("devolve grade vazia em dia sem agenda cadastrada", async () => {
    const response = await availability(brasilia, WEDNESDAY);

    expect(response.statusCode).toBe(200);
    expect(response.json().slots).toEqual([]);
  });

  it("subtrai a reserva ativa e ignora a cancelada", async () => {
    const tenant = await createTenant({
      email: "disponibilidade-reserva@exemplo.com",
      slug: "disponibilidade-reserva",
      timezone: "America/Sao_Paulo",
      schedules: [
        { weekday: TUESDAY_WEEKDAY, opensAt: "09:00:00", closesAt: "12:00:00", slotMinutes: 60 },
      ],
    });

    // 10:30 às 10:45 em Brasília: colide só com o segundo slot.
    await book(tenant, "2030-06-04T13:30:00Z", "2030-06-04T13:45:00Z");
    // 11:00 às 12:00 em Brasília, cancelada: não pode ocupar o terceiro slot.
    await book(tenant, "2030-06-04T14:00:00Z", "2030-06-04T15:00:00Z", "cancelled");

    const response = await availability(tenant, TUESDAY);

    expect(response.json().slots.map((slot: { available: boolean }) => slot.available)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("não duplica nem perde slots no dia em que o relógio adianta", async () => {
    const response = await availability(newYork, SPRING_FORWARD);

    expect(response.json().slots.map((slot: { startsAt: string }) => slot.startsAt)).toEqual([
      "2030-03-10T00:00:00-05:00",
      "2030-03-10T01:00:00-05:00",
      "2030-03-10T03:00:00-04:00",
      "2030-03-10T04:00:00-04:00",
      "2030-03-10T05:00:00-04:00",
    ]);
  });

  it("não duplica nem perde slots no dia em que o relógio atrasa", async () => {
    const response = await availability(newYork, FALL_BACK);
    const slots = response.json().slots as { startsAt: string; endsAt: string }[];

    expect(slots.map((slot) => slot.startsAt)).toEqual([
      "2030-11-03T00:00:00-04:00",
      "2030-11-03T01:00:00-04:00",
      "2030-11-03T01:00:00-05:00",
      "2030-11-03T02:00:00-05:00",
      "2030-11-03T03:00:00-05:00",
      "2030-11-03T04:00:00-05:00",
      "2030-11-03T05:00:00-05:00",
    ]);

    // Os dois slots rotulados 01:00 são instantes distintos e contíguos.
    expect(new Date(slots[1]!.endsAt).toISOString()).toBe(
      new Date(slots[2]!.startsAt).toISOString(),
    );
  });

  it("responde 404 para empresa inexistente", async () => {
    const response = await availability({ slug: "nao-existe", roomId: brasilia.roomId }, TUESDAY);

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("COMPANY_NOT_FOUND");
  });

  it("responde 404 para sala de outra empresa", async () => {
    const response = await availability({ slug: brasilia.slug, roomId: newYork.roomId }, TUESDAY);

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ROOM_NOT_FOUND");
  });

  it("responde 404 para sala inativa", async () => {
    const tenant = await createTenant({
      email: "disponibilidade-inativa@exemplo.com",
      slug: "disponibilidade-inativa",
      timezone: "America/Sao_Paulo",
      schedules: [
        { weekday: TUESDAY_WEEKDAY, opensAt: "09:00:00", closesAt: "12:00:00", slotMinutes: 60 },
      ],
    });

    expect((await availability(tenant, TUESDAY)).statusCode).toBe(200);

    await app.inject({
      method: "DELETE",
      url: `/api/v1/rooms/${tenant.roomId}`,
      headers: { cookie: tenant.cookie },
    });

    const response = await availability(tenant, TUESDAY);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ROOM_NOT_FOUND");
  });

  it("responde 400 para data ausente, malformada ou inexistente", async () => {
    const responses = await Promise.all([
      app.inject({
        method: "GET",
        url: `/api/v1/public/${brasilia.slug}/rooms/${brasilia.roomId}/availability`,
      }),
      availability(brasilia, "04/06/2030"),
      availability(brasilia, "2030-02-30"),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    }
  });

  it("responde 400 para roomId que não é uuid", async () => {
    const response = await availability({ slug: brasilia.slug, roomId: "nao-e-uuid" }, TUESDAY);

    expect(response.statusCode).toBe(400);
  });
});
