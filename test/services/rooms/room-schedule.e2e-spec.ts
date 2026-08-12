import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "@services/http/server";
import { roomSchedules } from "@services/rooms/infra/database/schema/room-schedules";
import { createTestDatabase, type TestDatabase } from "../setup/test-database";

let app: FastifyInstance;
let database: TestDatabase;

function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function authenticatedCompany(email: string, slug: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: {
      user: { name: "Bruno Tatsch", email, password: "senha-muito-segura" },
      company: { name: "Hotel Agenda", slug, type: "hotel", timezone: "America/Sao_Paulo" },
    },
  });

  return cookieHeader(response);
}

async function createRoom(cookie: string, name: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/rooms",
    headers: { cookie },
    payload: { name, capacity: 10, hourlyRateInCents: 12_000 },
  });

  return response.json().id as string;
}

function window(weekday: number, overrides: Record<string, unknown> = {}) {
  return {
    weekday,
    opensAt: "09:00:00",
    closesAt: "18:00:00",
    slotMinutes: 60,
    ...overrides,
  };
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

describe("rotas de /api/v1/rooms/:id/schedules", () => {
  it("responde 401 em todas as rotas sem sessão", async () => {
    const blankId = "00000000-0000-0000-0000-000000000000";
    const responses = await Promise.all([
      app.inject({ method: "GET", url: `/api/v1/rooms/${blankId}/schedules` }),
      app.inject({ method: "PUT", url: `/api/v1/rooms/${blankId}/schedules`, payload: [] }),
      app.inject({ method: "DELETE", url: `/api/v1/rooms/${blankId}/schedules/1` }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
    }
  });

  it("grava a semana, lê de volta ordenada e persiste no banco", async () => {
    const cookie = await authenticatedCompany("agenda-crud@exemplo.com", "agenda-crud");
    const roomId = await createRoom(cookie, "Sala com Agenda");

    const saved = await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(3), window(1), window(5, { slotMinutes: 30, closesAt: "12:00:00" })],
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject([
      { weekday: 1, roomId, opensAt: "09:00:00", closesAt: "18:00:00", slotMinutes: 60 },
      { weekday: 3 },
      { weekday: 5, closesAt: "12:00:00", slotMinutes: 30 },
    ]);

    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
    });

    expect(listed.json().map((schedule: { weekday: number }) => schedule.weekday)).toEqual([
      1, 3, 5,
    ]);

    const rows = await database.db
      .select()
      .from(roomSchedules)
      .where(eq(roomSchedules.roomId, roomId));
    expect(rows).toHaveLength(3);
  });

  it("substitui a semana anterior em vez de acumular", async () => {
    const cookie = await authenticatedCompany("agenda-substitui@exemplo.com", "agenda-substitui");
    const roomId = await createRoom(cookie, "Sala Substituída");

    await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(1), window(2), window(3)],
    });

    const replaced = await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(6)],
    });

    expect(replaced.json()).toHaveLength(1);
    const rows = await database.db
      .select()
      .from(roomSchedules)
      .where(eq(roomSchedules.roomId, roomId));
    expect(rows.map((row) => row.weekday)).toEqual([6]);
  });

  it("rejeita payload inválido com 400 e dia repetido com 400", async () => {
    const cookie = await authenticatedCompany("agenda-invalida@exemplo.com", "agenda-invalida");
    const roomId = await createRoom(cookie, "Sala Inválida");

    const badWindow = await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(1, { closesAt: "08:00:00" })],
    });
    expect(badWindow.statusCode).toBe(400);
    expect(badWindow.json().code).toBe("VALIDATION_ERROR");

    const badSlot = await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(1, { slotMinutes: 45 })],
    });
    expect(badSlot.statusCode).toBe(400);

    const duplicated = await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(1), window(1)],
    });
    expect(duplicated.statusCode).toBe(400);
  });

  it("fecha um dia específico com DELETE e devolve 404 no dia já fechado", async () => {
    const cookie = await authenticatedCompany("agenda-apaga@exemplo.com", "agenda-apaga");
    const roomId = await createRoom(cookie, "Sala Apagada");

    await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie },
      payload: [window(1), window(2)],
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/rooms/${roomId}/schedules/1`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(204);

    const again = await app.inject({
      method: "DELETE",
      url: `/api/v1/rooms/${roomId}/schedules/1`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(404);
    expect(again.json().code).toBe("ROOM_SCHEDULE_NOT_FOUND");

    const rows = await database.db
      .select()
      .from(roomSchedules)
      .where(eq(roomSchedules.roomId, roomId));
    expect(rows.map((row) => row.weekday)).toEqual([2]);
  });

  it("rejeita weekday fora de 0..6 no caminho da URL", async () => {
    const cookie = await authenticatedCompany("agenda-weekday@exemplo.com", "agenda-weekday");
    const roomId = await createRoom(cookie, "Sala Weekday");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/rooms/${roomId}/schedules/9`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("responde 404 para agenda de sala de outra empresa, sem alterá-la", async () => {
    const owner = await authenticatedCompany("agenda-dono@exemplo.com", "agenda-dono");
    const stranger = await authenticatedCompany("agenda-estranho@exemplo.com", "agenda-estranho");
    const roomId = await createRoom(owner, "Sala Alheia");

    await app.inject({
      method: "PUT",
      url: `/api/v1/rooms/${roomId}/schedules`,
      headers: { cookie: owner },
      payload: [window(1)],
    });

    const responses = await Promise.all([
      app.inject({
        method: "GET",
        url: `/api/v1/rooms/${roomId}/schedules`,
        headers: { cookie: stranger },
      }),
      app.inject({
        method: "PUT",
        url: `/api/v1/rooms/${roomId}/schedules`,
        headers: { cookie: stranger },
        payload: [window(6)],
      }),
      app.inject({
        method: "DELETE",
        url: `/api/v1/rooms/${roomId}/schedules/1`,
        headers: { cookie: stranger },
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("ROOM_NOT_FOUND");
    }

    const rows = await database.db
      .select()
      .from(roomSchedules)
      .where(eq(roomSchedules.roomId, roomId));
    expect(rows.map((row) => row.weekday)).toEqual([1]);
  });
});
