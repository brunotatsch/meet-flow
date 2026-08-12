import Fastify, { type FastifyInstance } from "fastify";
import { registerApiRoutes } from "./routes/index";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => ({
    status: "ok" as const,
    uptime: process.uptime(),
  }));

  app.register(registerApiRoutes, { prefix: "/api/v1" });

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
