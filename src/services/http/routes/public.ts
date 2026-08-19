import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { DrizzleAuditLog } from "@services/audit/infra/database/drizzle-audit-log";
import { env } from "@services/config/env";
import { CreateBookingCheckoutUseCase } from "@services/billing/application/create-booking-checkout.use-case";
import { PlanAccessService } from "@services/billing/application/plan-access.service";
import { DrizzleSubscriptionRepository } from "@services/billing/infra/database/drizzle-subscription.repository";
import { DrizzleUsageRepository } from "@services/billing/infra/database/drizzle-usage.repository";
import { createPlanLimitPreHandler } from "@services/billing/infra/http/plan-limit";
import { PublicCheckoutController } from "@services/billing/infra/http/public-checkout.controller";
import { StripeSdkGateway } from "@services/billing/infra/stripe/stripe-sdk.gateway";
import type { BillingRoutesDependencies } from "@services/billing/infra/http/routes";
import { CheckAvailabilityUseCase } from "@services/bookings/application/check-availability.use-case";
import { CreateBookingUseCase } from "@services/bookings/application/create-booking.use-case";
import { DrizzleBookingRepository } from "@services/bookings/infra/database/drizzle-booking.repository";
import { PublicAvailabilityController } from "@services/bookings/infra/http/public-availability.controller";
import { PublicBookingController } from "@services/bookings/infra/http/public-booking.controller";
import { SystemClock } from "@services/bookings/infra/system-clock";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { PublicCompanyController } from "@services/companies/infra/http/public-company.controller";
import { createResolveCompanySlug } from "@services/companies/infra/http/resolve-company-slug";
import { HttpError } from "@services/http/http-error";
import { createPostgresRateLimitStore } from "@services/http/rate-limit/postgres-rate-limit-store";
import { ListRoomsUseCase } from "@services/rooms/application/list-rooms.use-case";
import { DrizzleRoomBlockRepository } from "@services/room-blocks/infra/database/drizzle-room-block.repository";
import { DrizzleRoomScheduleRepository } from "@services/rooms/infra/database/drizzle-room-schedule.repository";
import { DrizzleRoomRepository } from "@services/rooms/infra/database/drizzle-room.repository";
import { PublicRoomController } from "@services/rooms/infra/http/public-room.controller";

export interface PublicRateLimitOptions {
  max: number;
  timeWindow: string;
}

export interface PublicRoutesRateLimitConfig {
  /** Cobre `GET /`, `GET /rooms` e `GET /rooms/:roomId/availability`, como um único limite. */
  general: PublicRateLimitOptions;
  /** Sobrescreve o geral só em `POST /bookings`, com um teto próprio e mais baixo. */
  booking: PublicRateLimitOptions;
}

/**
 * Limites de produção.
 *
 * O volume de chamadas legítimas de uma suíte e2e (dezenas de requisições na mesma
 * janela, do mesmo IP de teste) fica bem abaixo destes valores de propósito: baixar
 * o padrão global para "provar" o 429 quebraria toda suíte que já exercita o fluxo
 * público. O teste dedicado ao rate limit passa sua própria config, bem menor, em
 * vez de depender deste padrão. Ver `test/services/http/public-rate-limit.e2e-spec.ts`.
 */
export const defaultPublicRateLimitConfig: PublicRoutesRateLimitConfig = {
  general: { max: 200, timeWindow: "1 minute" },
  booking: { max: 80, timeWindow: "1 minute" },
};

interface PublicCompanySlugRequest {
  Params: { companySlug: string };
}

interface PublicRoomAvailabilityRequest {
  Params: { companySlug: string; roomId: string };
  Querystring: { date?: string };
}

/**
 * Superfície pública do wizard: `/api/v1/public/:companySlug/...`, sem sessão,
 * própria e separada da administrativa.
 *
 * Duas peças cross-cutting vivem uma única vez aqui, para as quatro rotas:
 *
 * - **Resolução de slug**: um único `preHandler`
 *   (`@services/companies/infra/http/resolve-company-slug`) resolve
 *   `companySlug -> companyId` e decora `request.publicCompany`. Nenhum controller
 *   sob este plugin aceita `companyId` vindo do corpo, da query ou de outro lugar.
 * - **Rate limit**: `@fastify/rate-limit` registrado neste escopo cobre as quatro
 *   rotas com o limite geral (modo `global`); `POST /bookings` sobrescreve com um
 *   limite próprio e mais rígido via `config.rateLimit`, o mecanismo do próprio
 *   plugin para dar a uma rota um contador independente do resto do escopo.
 *
 * Ver `docs/architecture.md`.
 */
export async function registerPublicRoutes(
  app: FastifyInstance,
  rateLimitConfig: PublicRoutesRateLimitConfig = defaultPublicRateLimitConfig,
  billingDependencies: BillingRoutesDependencies = {},
): Promise<void> {
  const companyRepository = new DrizzleCompanyRepository();
  const roomRepository = new DrizzleRoomRepository();
  const roomScheduleRepository = new DrizzleRoomScheduleRepository();
  const bookingRepository = new DrizzleBookingRepository();
  const roomBlockRepository = new DrizzleRoomBlockRepository();
  const clock = new SystemClock();
  const planAccess = new PlanAccessService(
    new DrizzleSubscriptionRepository(),
    new DrizzleUsageRepository(),
  );

  const companyController = new PublicCompanyController();
  const roomController = new PublicRoomController(new ListRoomsUseCase(roomRepository));
  const availabilityController = new PublicAvailabilityController(
    new CheckAvailabilityUseCase(
      companyRepository,
      roomRepository,
      roomScheduleRepository,
      bookingRepository,
      roomBlockRepository,
      clock,
    ),
  );
  const bookingController = new PublicBookingController(
    new CreateBookingUseCase(
      companyRepository,
      roomRepository,
      roomScheduleRepository,
      bookingRepository,
      clock,
    ),
    new CreateBookingCheckoutUseCase(
      billingDependencies.stripeGateway ?? new StripeSdkGateway(),
      bookingRepository,
      roomRepository,
      clock,
      billingDependencies.appUrl ?? env.APP_URL,
    ),
    new DrizzleAuditLog(),
  );
  const checkoutController = new PublicCheckoutController(bookingRepository);

  await app.register(
    async (publicScope) => {
      await publicScope.register(rateLimit, {
        max: rateLimitConfig.general.max,
        timeWindow: rateLimitConfig.general.timeWindow,
        store: createPostgresRateLimitStore("public"),
        skipOnError: false,
        errorResponseBuilder: buildRateLimitError,
      });

      publicScope.addHook("preHandler", createResolveCompanySlug(companyRepository));

      publicScope.get("/", (request, reply) => companyController.show(request, reply));

      publicScope.get<PublicCompanySlugRequest>("/rooms", (request, reply) =>
        roomController.list(request, reply),
      );

      publicScope.get<PublicRoomAvailabilityRequest>(
        "/rooms/:roomId/availability",
        {
          preHandler: async (request) => {
            const company = request.publicCompany;
            if (company) {
              await bookingRepository.expirePending(clock.now(), company.id, request.params.roomId);
            }
          },
        },
        (request, reply) => availabilityController.availability(request, reply),
      );

      publicScope.post<PublicCompanySlugRequest>(
        "/bookings",
        {
          config: { rateLimit: rateLimitConfig.booking },
          preHandler: createPlanLimitPreHandler(planAccess, "bookings", "public"),
        },
        (request, reply) => bookingController.create(request, reply),
      );

      publicScope.get<{
        Params: { companySlug: string; sessionId: string };
      }>("/checkout-sessions/:sessionId", (request, reply) =>
        checkoutController.show(request, reply),
      );
    },
    { prefix: "/public/:companySlug" },
  );
}

function buildRateLimitError(_request: FastifyRequest, context: { after: string }): HttpError {
  return new HttpError(
    429,
    "RATE_LIMITED",
    `Muitas requisições. Tente novamente em ${context.after}.`,
  );
}
