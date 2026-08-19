import { describe, expect, it, vi } from "vitest";
import { buildServer } from "@services/http/server";

describe("GET /api/health", () => {
  it("retorna liveness sem depender do uptime do isolate", async () => {
    const app = buildServer();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("retorna readiness quando o Postgres responde", async () => {
    const readinessCheck = vi.fn().mockResolvedValue(undefined);
    const app = buildServer({
      readinessCheck,
      security: { globalRateLimit: false },
    });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
    expect(readinessCheck).toHaveBeenCalledOnce();

    await app.close();
  });

  it("retorna 503 genérico e requestId quando o Postgres não está pronto", async () => {
    const app = buildServer({
      readinessCheck: vi.fn().mockRejectedValue(new Error("password=nao-pode-vazar")),
      security: { globalRateLimit: false },
    });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "unavailable",
      requestId: response.headers["x-request-id"],
    });
    expect(response.body).not.toContain("password");
    expect(response.body).not.toContain("nao-pode-vazar");

    await app.close();
  });
});
