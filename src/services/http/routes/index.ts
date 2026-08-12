import type { FastifyInstance } from "fastify";
import { registerBookingRoutes } from "@services/bookings/infra/http/routes";
import { registerIdentityRoutes } from "@services/identity/infra/http/routes";
import { registerRoomRoutes } from "@services/rooms/infra/http/routes";
import { registerPublicRoutes, type PublicRoutesRateLimitConfig } from "./public";

export interface ApiRoutesOptions {
  /** Sobrescreve os limites padrão de `registerPublicRoutes`. Ver `./public.ts`. */
  publicRateLimit?: PublicRoutesRateLimitConfig;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  options: ApiRoutesOptions = {},
): Promise<void> {
  await app.register(registerIdentityRoutes);
  await app.register(registerRoomRoutes);
  await app.register(registerBookingRoutes);
  await app.register((instance) => registerPublicRoutes(instance, options.publicRateLimit));
}
