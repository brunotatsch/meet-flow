import type { FastifyInstance } from "fastify";
import { registerBookingRoutes } from "@services/bookings/infra/http/routes";
import { registerIdentityRoutes } from "@services/identity/infra/http/routes";
import { registerRoomRoutes } from "@services/rooms/infra/http/routes";
import {
  type BillingRoutesDependencies,
  registerBillingRoutes,
  registerStripeWebhookRoutes,
} from "@services/billing/infra/http/routes";
import {
  type NotificationRoutesDependencies,
  registerNotificationRoutes,
} from "@services/notifications/infra/http/routes";
import { registerReportRoutes } from "@services/reports/infra/http/routes";
import { registerRoomBlockRoutes } from "@services/room-blocks/infra/http/routes";
import { registerRateLimitMaintenanceRoutes } from "@services/http/rate-limit/maintenance";
import { registerPublicRoutes, type PublicRoutesRateLimitConfig } from "./public";

export interface ApiRoutesOptions {
  /** Sobrescreve os limites padrão de `registerPublicRoutes`. Ver `./public.ts`. */
  publicRateLimit?: PublicRoutesRateLimitConfig;
  billing?: BillingRoutesDependencies;
  notifications?: NotificationRoutesDependencies;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  options: ApiRoutesOptions = {},
): Promise<void> {
  await app.register(registerIdentityRoutes);
  await app.register((instance) => registerBillingRoutes(instance, options.billing));
  await app.register((instance) => registerStripeWebhookRoutes(instance, options.billing));
  await app.register(registerRoomRoutes);
  await app.register(registerRoomBlockRoutes);
  await app.register(registerBookingRoutes);
  await app.register(registerReportRoutes);
  await app.register((instance) => registerNotificationRoutes(instance, options.notifications));
  await app.register((instance) => registerRateLimitMaintenanceRoutes(instance));
  await app.register((instance) =>
    registerPublicRoutes(instance, options.publicRateLimit, options.billing),
  );
}
