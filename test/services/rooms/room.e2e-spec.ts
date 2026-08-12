import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "@services/http/server";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import { createTestDatabase, type TestDatabase } from "../setup/test-database";

let app: FastifyInstance;
let database: TestDatabase;

function signUpPayload(overrides: { email?: string; slug?: string } = {}) {
  return {
    user: {
      name: "Bruno Tatsch",
      email: overrides.email ?? "rooms-bruno@exemplo.com",
      password: "senha-muito-segura",
    },
    company: {
      name: "Hotel Rooms",
      slug: overrides.slug ?? "rooms-hotel-aurora",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    },
  };
}

/** Reduz o `Set-Cookie` da resposta ao formato aceito no header `Cookie`. */
function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function authenticatedCompany(overrides: Parameters<typeof signUpPayload>[0] = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: signUpPayload(overrides),
  });

  return { cookie: cookieHeader(response), companyId: response.json().company.id as string };
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

describe("rotas de /api/v1/rooms", () => {
  it("responde 401 em todas as rotas sem sessão", async () => {
    const blankId = "00000000-0000-0000-0000-000000000000";
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/rooms" }),
      app.inject({ method: "POST", url: "/api/v1/rooms", payload: {} }),
      app.inject({ method: "GET", url: `/api/v1/rooms/${blankId}` }),
      app.inject({ method: "PATCH", url: `/api/v1/rooms/${blankId}`, payload: {} }),
      app.inject({ method: "DELETE", url: `/api/v1/rooms/${blankId}` }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
    }
  });

  describe("POST /api/v1/rooms", () => {
    it("cria uma sala para a empresa autenticada", async () => {
      const { cookie, companyId } = await authenticatedCompany({
        email: "criar@exemplo.com",
        slug: "rooms-criar",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie },
        payload: { name: "Sala Atlântico", capacity: 10, hourlyRateInCents: 15_000 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        name: "Sala Atlântico",
        capacity: 10,
        companyId,
        isActive: true,
        amenities: [],
      });

      const [row] = await database.db.select().from(rooms).where(eq(rooms.id, body.id));
      expect(row?.companyId).toBe(companyId);
    });

    it("rejeita payload inválido com 400", async () => {
      const { cookie } = await authenticatedCompany({
        email: "invalido@exemplo.com",
        slug: "rooms-invalido",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie },
        payload: { name: "ab", capacity: -1, hourlyRateInCents: 1000 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    });

    it("devolve 409 ao repetir o nome na mesma empresa e permite o mesmo nome em outra", async () => {
      const first = await authenticatedCompany({ email: "dup1@exemplo.com", slug: "rooms-dup-1" });
      const second = await authenticatedCompany({ email: "dup2@exemplo.com", slug: "rooms-dup-2" });
      const payload = { name: "Sala Compartilhada", capacity: 5, hourlyRateInCents: 10_000 };

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie: first.cookie },
        payload,
      });
      expect(created.statusCode).toBe(201);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie: first.cookie },
        payload,
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().code).toBe("DUPLICATE_ROOM_NAME");

      const allowed = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie: second.cookie },
        payload,
      });
      expect(allowed.statusCode).toBe(201);
    });
  });

  describe("GET /api/v1/rooms e /api/v1/rooms/:id", () => {
    it("lista e busca apenas salas da empresa autenticada", async () => {
      const owner = await authenticatedCompany({
        email: "listar@exemplo.com",
        slug: "rooms-listar",
      });
      const stranger = await authenticatedCompany({
        email: "estranho@exemplo.com",
        slug: "rooms-estranho",
      });

      const createdRoom = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie: owner.cookie },
        payload: { name: "Sala Norte", capacity: 8, hourlyRateInCents: 12_000 },
      });
      const roomId = createdRoom.json().id;

      const list = await app.inject({
        method: "GET",
        url: "/api/v1/rooms",
        headers: { cookie: owner.cookie },
      });
      expect(list.json()).toHaveLength(1);

      const strangerList = await app.inject({
        method: "GET",
        url: "/api/v1/rooms",
        headers: { cookie: stranger.cookie },
      });
      expect(strangerList.json()).toHaveLength(0);

      const strangerGet = await app.inject({
        method: "GET",
        url: `/api/v1/rooms/${roomId}`,
        headers: { cookie: stranger.cookie },
      });
      expect(strangerGet.statusCode).toBe(404);
      expect(strangerGet.json().code).toBe("ROOM_NOT_FOUND");

      const ownerGet = await app.inject({
        method: "GET",
        url: `/api/v1/rooms/${roomId}`,
        headers: { cookie: owner.cookie },
      });
      expect(ownerGet.statusCode).toBe(200);
      expect(ownerGet.json().id).toBe(roomId);
    });
  });

  describe("PATCH /api/v1/rooms/:id", () => {
    it("atualiza campos parciais da sala", async () => {
      const { cookie } = await authenticatedCompany({
        email: "editar@exemplo.com",
        slug: "rooms-editar",
      });

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie },
        payload: { name: "Sala Original", capacity: 6, hourlyRateInCents: 9_000 },
      });
      const roomId = created.json().id;

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/rooms/${roomId}`,
        headers: { cookie },
        payload: { capacity: 12 },
      });

      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: roomId, capacity: 12, name: "Sala Original" });
    });

    it("devolve 404 ao editar sala de outra empresa", async () => {
      const owner = await authenticatedCompany({
        email: "editar-dono@exemplo.com",
        slug: "rooms-editar-dono",
      });
      const stranger = await authenticatedCompany({
        email: "editar-estranho@exemplo.com",
        slug: "rooms-editar-estranho",
      });

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie: owner.cookie },
        payload: { name: "Sala Alheia", capacity: 6, hourlyRateInCents: 9_000 },
      });
      const roomId = created.json().id;

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/rooms/${roomId}`,
        headers: { cookie: stranger.cookie },
        payload: { capacity: 99 },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/rooms/:id", () => {
    it("desativa a sala em vez de removê-la", async () => {
      const { cookie } = await authenticatedCompany({
        email: "desativar@exemplo.com",
        slug: "rooms-desativar",
      });

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie },
        payload: { name: "Sala a Desativar", capacity: 4, hourlyRateInCents: 5_000 },
      });
      const roomId = created.json().id;

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/rooms/${roomId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().isActive).toBe(false);

      const [row] = await database.db.select().from(rooms).where(eq(rooms.id, roomId));
      expect(row?.isActive).toBe(false);
    });
  });
});
