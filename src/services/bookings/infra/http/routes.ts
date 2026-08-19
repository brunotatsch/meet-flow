import type { FastifyInstance } from "fastify";
import { PermissionAction, PermissionResource } from "@shared/auth/permissions";
import { DrizzleAuditLog } from "@services/audit/infra/database/drizzle-audit-log";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { PlanAccessService } from "@services/billing/application/plan-access.service";
import { DrizzleSubscriptionRepository } from "@services/billing/infra/database/drizzle-subscription.repository";
import { DrizzleUsageRepository } from "@services/billing/infra/database/drizzle-usage.repository";
import { createPlanLimitPreHandler } from "@services/billing/infra/http/plan-limit";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { requirePermission } from "@services/identity/infra/http/require-permission";
import { CancelBookingUseCase } from "../../application/cancel-booking.use-case";
import { CheckInBookingUseCase } from "../../application/check-in-booking.use-case";
import { CheckOutBookingUseCase } from "../../application/check-out-booking.use-case";
import { CreateBookingUseCase } from "../../application/create-booking.use-case";
import { ListBookingsUseCase } from "../../application/list-bookings.use-case";
import { MarkBookingNoShowUseCase } from "../../application/mark-booking-no-show.use-case";
import { RescheduleBookingUseCase } from "../../application/reschedule-booking.use-case";
import { DrizzleRoomScheduleRepository } from "@services/rooms/infra/database/drizzle-room-schedule.repository";
import { DrizzleRoomRepository } from "@services/rooms/infra/database/drizzle-room.repository";
import { DrizzleBookingRepository } from "../database/drizzle-booking.repository";
import { SystemClock } from "../system-clock";
import { BookingController } from "./booking.controller";

/**
 * Rotas administrativas de reservas, atrás de `requireAuth`.
 *
 * A dupla pública (`GET .../availability` e `POST .../bookings`) mora no plugin
 * `/public/:companySlug` (`@services/http/routes/public`), que centraliza a
 * resolução de slug e o rate limit das rotas do wizard. Ver `docs/architecture.md`.
 */
export async function registerBookingRoutes(app: FastifyInstance): Promise<void> {
  const companyRepository = new DrizzleCompanyRepository();
  const bookingRepository = new DrizzleBookingRepository();
  const roomRepository = new DrizzleRoomRepository();
  const roomScheduleRepository = new DrizzleRoomScheduleRepository();
  const clock = new SystemClock();
  const planAccess = new PlanAccessService(
    new DrizzleSubscriptionRepository(),
    new DrizzleUsageRepository(),
  );

  const bookingController = new BookingController(
    companyRepository,
    new CreateBookingUseCase(
      companyRepository,
      roomRepository,
      roomScheduleRepository,
      bookingRepository,
      clock,
    ),
    new ListBookingsUseCase(bookingRepository),
    new CancelBookingUseCase(bookingRepository),
    new RescheduleBookingUseCase(
      companyRepository,
      roomRepository,
      roomScheduleRepository,
      bookingRepository,
      clock,
    ),
    new CheckInBookingUseCase(bookingRepository, clock),
    new CheckOutBookingUseCase(bookingRepository, clock),
    new MarkBookingNoShowUseCase(bookingRepository, clock),
    new DrizzleAuditLog(),
  );

  app.post(
    "/bookings",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.CREATE, PermissionResource.BOOKING),
        createPlanLimitPreHandler(planAccess, "bookings", "authenticated"),
      ],
    },
    (request, reply) => bookingController.create(request, reply),
  );

  app.get(
    "/bookings",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.READ, PermissionResource.BOOKING),
      ],
    },
    (request, reply) => bookingController.list(request, reply),
  );

  /**
   * `DELETE` cancela em vez de apagar, como em `/rooms/:id`: a linha permanece com
   * `status = 'cancelled'`, sai do índice de `bookings_no_overlap` e devolve o
   * horário para a grade, sem perder o histórico.
   */
  app.delete<{ Params: { id: string } }>(
    "/bookings/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.CANCEL, PermissionResource.BOOKING),
      ],
    },
    (request, reply) => bookingController.cancel(request, reply),
  );

  app.patch<{ Params: { id: string } }>(
    "/bookings/:id/reschedule",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.UPDATE, PermissionResource.BOOKING),
      ],
    },
    (request, reply) => bookingController.reschedule(request, reply),
  );

  for (const [path, handler] of [
    ["check-in", bookingController.checkIn.bind(bookingController)],
    ["check-out", bookingController.checkOut.bind(bookingController)],
    ["no-show", bookingController.noShow.bind(bookingController)],
  ] as const) {
    app.post<{ Params: { id: string } }>(
      `/bookings/:id/${path}`,
      {
        preHandler: [
          requireAuth,
          requirePermission(PermissionAction.UPDATE, PermissionResource.BOOKING),
        ],
      },
      handler,
    );
  }
}
