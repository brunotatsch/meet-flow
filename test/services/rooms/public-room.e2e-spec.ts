import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicRoomResponseSchema } from "@shared/schemas/room.schema";
import { buildServer } from "@services/http/server";

let app: FastifyInstance;

interface Tenant {
  cookie: string;
  slug: string;
}

function signUpPayload(overrides: { email?: string; slug?: string } = {}) {
  return {
    user: {
      name: "Bruno Tatsch",
      email: overrides.email ?? "salas-publicas@exemplo.com",
      password: "senha-muito-segura",
    },
    company: {
      name: "Hotel Salas Públicas",
      slug: overrides.slug ?? "salas-publicas",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    },
  };
}

function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function createTenant(overrides: Parameters<typeof signUpPayload>[0] = {}): Promise<Tenant> {
  const signUp = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: signUpPayload(overrides),
  });

  return { cookie: cookieHeader(signUp), slug: signUpPayload(overrides).company.slug };
}

async function createRoom(
  tenant: Tenant,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/rooms",
    headers: { cookie: tenant.cookie },
    payload: {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 12_000,
      description: "Vista para o mar",
      amenities: ["projetor", "wifi"],
      ...overrides,
    },
  });

  return response.json().id as string;
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

describe("GET /api/v1/public/:companySlug/rooms", () => {
  it("lista só salas ativas, no formato do contrato público", async () => {
    const tenant = await createTenant({ email: "listagem@exemplo.com", slug: "salas-listagem" });
    await createRoom(tenant);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public/${tenant.slug}/rooms`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(() => PublicRoomResponseSchema.parse(body[0])).not.toThrow();
    expect(body[0]).toMatchObject({
      name: "Sala Atlântico",
      description: "Vista para o mar",
      capacity: 10,
      hourlyRateInCents: 12_000,
      amenities: ["projetor", "wifi"],
    });
  });

  it("nunca devolve companyId, isActive, createdAt nem updatedAt", async () => {
    const tenant = await createTenant({ email: "campos@exemplo.com", slug: "salas-campos" });
    await createRoom(tenant);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public/${tenant.slug}/rooms`,
    });

    expect(Object.keys(response.json()[0])).toEqual([
      "id",
      "name",
      "description",
      "capacity",
      "hourlyRateInCents",
      "amenities",
      "photoUrl",
    ]);
  });

  it("some com a sala assim que ela é desativada", async () => {
    const tenant = await createTenant({ email: "inativa@exemplo.com", slug: "salas-inativa" });
    const roomId = await createRoom(tenant);

    expect(
      (await app.inject({ method: "GET", url: `/api/v1/public/${tenant.slug}/rooms` })).json(),
    ).toHaveLength(1);

    await app.inject({
      method: "DELETE",
      url: `/api/v1/rooms/${roomId}`,
      headers: { cookie: tenant.cookie },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public/${tenant.slug}/rooms`,
    });

    expect(response.json()).toEqual([]);
  });

  it("não mistura salas de outra empresa", async () => {
    const hotel = await createTenant({ email: "isolamento-hotel@exemplo.com", slug: "salas-hotel" });
    const coworking = await createTenant({
      email: "isolamento-coworking@exemplo.com",
      slug: "salas-coworking",
    });
    await createRoom(hotel, { name: "Sala Hotel" });
    await createRoom(coworking, { name: "Sala Coworking" });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public/${hotel.slug}/rooms`,
    });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({ name: "Sala Hotel" });
  });

  it("responde 404 para slug inexistente", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/public/nao-existe/rooms" });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("COMPANY_NOT_FOUND");
  });
});
