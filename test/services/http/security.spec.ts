import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerErrorHandler } from "@services/http/http-error";
import { createPostgresRateLimitStore } from "@services/http/rate-limit/postgres-rate-limit-store";
import { LOGGER_REDACT_PATHS, registerHttpSecurity } from "@services/http/security";
import type { RequestAuth } from "@services/identity/infra/http/require-auth";

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("hardening HTTP", () => {
  it("emite Helmet e CORS apenas para a allowlist", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    registerErrorHandler(app);
    registerHttpSecurity(app, {
      allowedCorsOrigins: ["https://admin.example.com"],
      globalRateLimit: false,
    });
    app.get("/resource", async () => ({ ok: true }));

    const allowed = await app.inject({
      method: "GET",
      url: "/resource",
      headers: { origin: "https://admin.example.com" },
    });
    const denied = await app.inject({
      method: "GET",
      url: "/resource",
      headers: { origin: "https://attacker.example" },
    });
    const malformed = await app.inject({
      method: "GET",
      url: "/resource",
      headers: { origin: "null" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("https://admin.example.com");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-request-id"]).toBeTypeOf("string");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(malformed.statusCode).toBe(200);
    expect(malformed.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("recusa preflight de origem não autorizada sem refletir credenciais", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    registerHttpSecurity(app, {
      allowedCorsOrigins: ["https://admin.example.com"],
      globalRateLimit: false,
    });
    app.post("/resource", async () => ({ ok: true }));

    const response = await app.inject({
      method: "OPTIONS",
      url: "/resource",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "POST",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("marca respostas autenticadas como privadas e sem cache", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    registerHttpSecurity(app, { globalRateLimit: false });
    app.get(
      "/protected",
      {
        preHandler: async (request) => {
          request.auth = {
            userId: "user-1",
            companyId: "company-1",
            organizationId: "organization-1",
            role: "owner",
          } satisfies RequestAuth;
        },
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers.vary).toContain("Cookie");
  });

  it("impede cache dos endpoints de sessão mesmo antes de request.auth ser decorado", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    registerHttpSecurity(app, { globalRateLimit: false });
    app.get("/api/auth/get-session", async () => ({ user: null }));

    const response = await app.inject({ method: "GET", url: "/api/auth/get-session" });

    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
  });

  it("aplica o limite global por store externa e mantém probes fora do contador", async () => {
    const counters = new Map<string, number>();
    const store = createPostgresRateLimitStore("test-global", {
      async increment(scope, keyHash, timeWindow) {
        const key = `${scope}:${keyHash}`;
        const current = (counters.get(key) ?? 0) + 1;
        counters.set(key, current);
        return { current, ttl: timeWindow };
      },
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    registerErrorHandler(app);
    registerHttpSecurity(app, {
      helmet: false,
      globalRateLimit: { max: 2, timeWindow: 60_000, store },
    });
    app.get("/limited", async () => ({ ok: true }));
    app.get("/api/health", async () => ({ status: "ok" }));

    expect((await app.inject({ method: "GET", url: "/limited" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/limited" })).statusCode).toBe(200);

    const exceeded = await app.inject({ method: "GET", url: "/limited" });
    expect(exceeded.statusCode).toBe(429);
    expect(exceeded.json()).toMatchObject({
      code: "RATE_LIMITED",
      requestId: exceeded.headers["x-request-id"],
    });
    expect(exceeded.headers["retry-after"]).toBe("60");
  });

  it("responde 503 quando o Postgres do rate limit falha antes do cadastro", async () => {
    const store = createPostgresRateLimitStore("test-unavailable", {
      async increment() {
        throw Object.assign(new Error("password=nao-pode-vazar"), {
          code: "ERR_POSTGRES_CONNECTION_CLOSED",
        });
      },
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    registerErrorHandler(app);
    registerHttpSecurity(app, {
      helmet: false,
      globalRateLimit: { max: 2, timeWindow: 60_000, store },
    });
    let signUpRan = false;

    app.post("/api/v1/sign-up", async () => {
      signUpRan = true;
      return { ok: true };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sign-up",
      payload: { password: "tambem-nao-pode-vazar" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Serviço temporariamente indisponível. Tente novamente.",
    });
    expect(response.headers["retry-after"]).toBe("5");
    expect(response.body).not.toContain("nao-pode-vazar");
    expect(signUpRan).toBe(false);
  });

  it("configura redaction para credenciais, cookies e segredos de payload", () => {
    expect(LOGGER_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "res.headers['set-cookie']",
        "request.headers.authorization",
        "body.password",
        "body.token",
        "body.secret",
      ]),
    );
  });
});
