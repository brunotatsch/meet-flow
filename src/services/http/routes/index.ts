import type { FastifyInstance } from "fastify";
import { registerIdentityRoutes } from "@services/identity/infra/http/routes";

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerIdentityRoutes);
}
