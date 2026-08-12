import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicCompanyResponseSchema } from "@shared/schemas/company.schema";
import { buildServer } from "@services/http/server";

let app: FastifyInstance;

function signUpPayload(overrides: { email?: string; slug?: string } = {}) {
  return {
    user: {
      name: "Bruno Tatsch",
      email: overrides.email ?? "empresa-publica@exemplo.com",
      password: "senha-muito-segura",
    },
    company: {
      name: "Hotel Vista Pública",
      slug: overrides.slug ?? "empresa-publica",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    },
  };
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();

  await app.inject({ method: "POST", url: "/api/v1/sign-up", payload: signUpPayload() });
});

afterAll(async () => {
  await app?.close();
});

describe("GET /api/v1/public/:companySlug", () => {
  it("responde sem sessão, no formato do contrato público", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/public/empresa-publica" });

    expect(response.statusCode).toBe(200);
    expect(() => PublicCompanyResponseSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toEqual({
      name: "Hotel Vista Pública",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    });
  });

  it("não devolve id nem slug, campos que o contrato público não expõe", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/public/empresa-publica" });

    expect(Object.keys(response.json())).toEqual(["name", "type", "timezone"]);
  });

  it("responde 404 para slug inexistente", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/public/nao-existe" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "COMPANY_NOT_FOUND",
      message: "Empresa não encontrada.",
    });
  });
});
