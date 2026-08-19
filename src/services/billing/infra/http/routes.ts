import type { FastifyInstance } from "fastify";
import { PermissionAction, PermissionResource } from "@shared/auth/permissions";
import { env } from "@services/config/env";
import { DrizzleBookingRepository } from "@services/bookings/infra/database/drizzle-booking.repository";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { requirePermission } from "@services/identity/infra/http/require-permission";
import { CustomerPortalUseCase } from "../../application/customer-portal.use-case";
import { ExpirePendingBookingsUseCase } from "../../application/expire-pending-bookings.use-case";
import { PlanAccessService } from "../../application/plan-access.service";
import { ProcessStripeWebhookUseCase } from "../../application/process-stripe-webhook.use-case";
import { SubscriptionCheckoutUseCase } from "../../application/subscription-checkout.use-case";
import { DrizzleStripeEventProcessor } from "../database/drizzle-stripe-event.processor";
import { DrizzleSubscriptionRepository } from "../database/drizzle-subscription.repository";
import { DrizzleUsageRepository } from "../database/drizzle-usage.repository";
import { StripeSdkGateway } from "../stripe/stripe-sdk.gateway";
import type { StripeGateway } from "../../application/stripe-gateway";
import type { StripeEventProcessor } from "../../application/process-stripe-webhook.use-case";
import { BillingController } from "./billing.controller";
import { BillingJobController } from "./job.controller";
import { StripeWebhookController } from "./stripe-webhook.controller";

export interface BillingRoutesDependencies {
  stripeGateway?: StripeGateway;
  stripeEventProcessor?: StripeEventProcessor;
  appUrl?: string;
}

export async function registerBillingRoutes(
  app: FastifyInstance,
  dependencies: BillingRoutesDependencies = {},
): Promise<void> {
  const subscriptions = new DrizzleSubscriptionRepository();
  const gateway = dependencies.stripeGateway ?? new StripeSdkGateway();
  const appUrl = dependencies.appUrl ?? env.APP_URL;
  const access = new PlanAccessService(subscriptions, new DrizzleUsageRepository());
  const controller = new BillingController(
    access,
    new SubscriptionCheckoutUseCase(subscriptions, gateway, appUrl),
    new CustomerPortalUseCase(subscriptions, gateway, appUrl),
  );
  const jobs = new BillingJobController(
    new ExpirePendingBookingsUseCase(new DrizzleBookingRepository()),
  );

  app.get(
    "/billing",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.READ, PermissionResource.BILLING),
      ],
    },
    (request, reply) => controller.show(request, reply),
  );
  app.post(
    "/billing/checkout",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.MANAGE, PermissionResource.BILLING),
      ],
    },
    (request, reply) => controller.createCheckout(request, reply),
  );
  app.post(
    "/billing/portal",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.MANAGE, PermissionResource.BILLING),
      ],
    },
    (request, reply) => controller.createPortal(request, reply),
  );
  app.post("/jobs/expire-pending-bookings", (request, reply) => jobs.expire(request, reply));
}

/**
 * Plugin isolado para substituir o parser JSON apenas nessa rota. Verificar a
 * assinatura depois de JSON.parse quebraria o HMAC por alterar bytes/espaços.
 */
export async function registerStripeWebhookRoutes(
  app: FastifyInstance,
  dependencies: BillingRoutesDependencies = {},
): Promise<void> {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 1_048_576 },
    (_request, body, done) => done(null, body),
  );

  const gateway = dependencies.stripeGateway ?? new StripeSdkGateway();
  const controller = new StripeWebhookController(
    new ProcessStripeWebhookUseCase(
      gateway,
      dependencies.stripeEventProcessor ?? new DrizzleStripeEventProcessor(),
    ),
  );

  app.post("/webhooks/stripe", (request, reply) => controller.handle(request, reply));
}
