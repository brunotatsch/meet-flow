import Fastify, { type FastifyInstance } from "fastify";
import { registerAuthHandler } from "@services/identity/infra/http/auth-handler";
import { registerErrorHandler } from "./http-error";
import { registerApiRoutes, type ApiRoutesOptions } from "./routes/index";

export interface BuildServerOptions {
  api?: ApiRoutesOptions;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  registerErrorHandler(app);

  app.get("/health", async () => ({
    status: "ok" as const,
    uptime: process.uptime(),
  }));

  /**
   * O prefixo precisa ser exatamente o `basePath` do Better Auth. Ele roteia pelo
   * caminho completo da URL, então mudar um lado sem o outro devolve 404 em todo
   * endpoint de autenticação.
   */
  app.register(registerAuthHandler, { prefix: "/api/auth" });
  app.register((instance) => registerApiRoutes(instance, options.api), { prefix: "/api/v1" });

  return app;
}

if (import.meta.main) {
  const { env } = await import("@services/config/env");
  const app = buildServer();

  app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
}
