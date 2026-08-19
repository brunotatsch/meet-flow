import { randomUUID } from "node:crypto";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import { env } from "@services/config/env";
import { assertDatabaseReady } from "@services/database/readiness";
import { registerAuthHandler } from "@services/identity/infra/http/auth-handler";
import { registerErrorHandler } from "./http-error";
import { registerApiRoutes, type ApiRoutesOptions } from "./routes/index";
import { LOGGER_REDACT_PATHS, registerHttpSecurity, type HttpSecurityOptions } from "./security";

export interface BuildServerOptions {
  api?: ApiRoutesOptions;
  security?: HttpSecurityOptions;
  readinessCheck?: () => Promise<void>;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: [...LOGGER_REDACT_PATHS], censor: "[REDACTED]" },
    },
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
    trustProxy: env.NODE_ENV === "production",
  });

  registerErrorHandler(app);
  registerHttpSecurity(app, options.security);

  app.get("/api/health", async () => ({
    status: "ok" as const,
  }));

  app.get("/api/ready", async (request, reply) => {
    try {
      await (options.readinessCheck ?? checkDatabaseReadiness)();
      return { status: "ready" as const };
    } catch {
      request.log.warn(
        { event: "readiness_failed", requestId: request.id },
        "readiness check failed",
      );
      return reply.code(503).send({ status: "unavailable" as const, requestId: request.id });
    }
  });

  /**
   * O prefixo precisa ser exatamente o `basePath` do Better Auth. Ele roteia pelo
   * caminho completo da URL, então mudar um lado sem o outro devolve 404 em todo
   * endpoint de autenticação.
   */
  app.register(registerAuthHandler, { prefix: "/api/auth" });
  app.register((instance) => registerApiRoutes(instance, options.api), { prefix: "/api/v1" });

  return app;
}

async function checkDatabaseReadiness(): Promise<void> {
  await assertDatabaseReady();
}
