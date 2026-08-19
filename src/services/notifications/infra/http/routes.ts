import type { FastifyInstance } from "fastify";
import { env } from "@services/config/env";
import { DrizzleBookingRepository } from "@services/bookings/infra/database/drizzle-booking.repository";
import { SystemClock } from "@services/bookings/infra/system-clock";
import { CancelBookingWithTokenUseCase } from "../../application/cancel-booking-with-token.use-case";
import { ProcessEmailOutboxUseCase } from "../../application/process-email-outbox.use-case";
import { BookingCancellationToken } from "../../domain/cancellation-token";
import type { EmailSender } from "../../domain/email-sender";
import { DrizzleEmailOutboxRepository } from "../database/drizzle-email-outbox.repository";
import { createEmailSender } from "../email/email-sender.factory";
import { EmailOutboxJobController, PublicCancellationController } from "./notification.controller";

export interface NotificationRoutesDependencies {
  sender?: EmailSender;
  cancellationSecret?: string;
  appUrl?: string;
}

export async function registerNotificationRoutes(
  app: FastifyInstance,
  dependencies: NotificationRoutesDependencies = {},
): Promise<void> {
  const clock = new SystemClock();
  const token = new BookingCancellationToken(
    dependencies.cancellationSecret ??
      process.env.BOOKING_CANCELLATION_SECRET ??
      env.BETTER_AUTH_SECRET,
  );
  const repository = new DrizzleEmailOutboxRepository();
  const cancellation = new PublicCancellationController(
    new CancelBookingWithTokenUseCase(new DrizzleBookingRepository(), token, clock),
  );
  const job = new EmailOutboxJobController(
    new ProcessEmailOutboxUseCase(
      repository,
      dependencies.sender ?? createEmailSender(),
      token,
      clock,
      dependencies.appUrl ?? env.APP_URL,
    ),
  );

  app.post("/public/bookings/cancel", (request, reply) => cancellation.cancel(request, reply));
  app.post("/jobs/process-email-outbox", (request, reply) => job.process(request, reply));
}
