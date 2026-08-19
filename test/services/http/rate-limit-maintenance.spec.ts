import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "@services/http/http-error";
import {
  ExpiredRateLimitCleaner,
  registerRateLimitMaintenanceRoutes,
} from "@services/http/rate-limit/maintenance";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

class FakeCleaner extends ExpiredRateLimitCleaner {
  cleanup = vi.fn(async () => 37);
}

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

async function build(cleaner: FakeCleaner) {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register((instance) => registerRateLimitMaintenanceRoutes(instance, cleaner), {
    prefix: "/api/v1",
  });
  await app.ready();
  return app;
}

describe("manutenção do rate limit distribuído", () => {
  it("remove contadores expirados em lote com o segredo correto", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests-with-32-characters";
    const cleaner = new FakeCleaner();
    const app = await build(cleaner);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs/cleanup-rate-limits",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: 37 });
    expect(cleaner.cleanup).toHaveBeenCalledOnce();
    await app.close();
  });

  it("não executa sem credencial válida", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests-with-32-characters";
    const cleaner = new FakeCleaner();
    const app = await build(cleaner);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs/cleanup-rate-limits",
      headers: { authorization: "Bearer incorreto" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_CRON_SECRET");
    expect(cleaner.cleanup).not.toHaveBeenCalled();
    await app.close();
  });

  it("falha fechado quando CRON_SECRET não está configurado", async () => {
    delete process.env.CRON_SECRET;
    const cleaner = new FakeCleaner();
    const app = await build(cleaner);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs/cleanup-rate-limits",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("CRON_NOT_CONFIGURED");
    expect(cleaner.cleanup).not.toHaveBeenCalled();
    await app.close();
  });
});
