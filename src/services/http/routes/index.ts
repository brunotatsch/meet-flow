import type { FastifyInstance } from "fastify";
import { registerBookingRoutes } from "@services/bookings/infra/http/routes";
import { registerIdentityRoutes } from "@services/identity/infra/http/routes";
import { registerRoomRoutes } from "@services/rooms/infra/http/routes";

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerIdentityRoutes);
  await app.register(registerRoomRoutes);
  await app.register(registerBookingRoutes);
}
