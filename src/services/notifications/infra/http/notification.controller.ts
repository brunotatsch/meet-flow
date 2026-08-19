import type { FastifyReply, FastifyRequest } from "fastify";
import { CancelBookingByTokenSchema } from "@shared/schemas/cancellation.schema";
import { requireCronSecret } from "@services/http/cron-auth";
import { HttpError } from "@services/http/http-error";
import {
  BookingCancellationNotAllowedError,
  type CancelBookingWithTokenUseCase,
} from "../../application/cancel-booking-with-token.use-case";
import type { ProcessEmailOutboxUseCase } from "../../application/process-email-outbox.use-case";
import {
  ExpiredCancellationTokenError,
  InvalidCancellationTokenError,
} from "../../domain/cancellation-token";

export class PublicCancellationController {
  constructor(private readonly cancelBooking: CancelBookingWithTokenUseCase) {}

  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = CancelBookingByTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Token de cancelamento inválido.");
    }

    try {
      await this.cancelBooking.execute(parsed.data.token);
      return reply.send({ status: "cancelled" as const });
    } catch (error) {
      if (error instanceof ExpiredCancellationTokenError) {
        throw new HttpError(410, "CANCELLATION_LINK_EXPIRED", error.message);
      }
      if (error instanceof InvalidCancellationTokenError) {
        throw new HttpError(400, "INVALID_CANCELLATION_TOKEN", error.message);
      }
      if (error instanceof BookingCancellationNotAllowedError) {
        throw new HttpError(409, "BOOKING_CANCELLATION_NOT_ALLOWED", error.message);
      }
      throw error;
    }
  }
}

export class EmailOutboxJobController {
  constructor(private readonly processOutbox: ProcessEmailOutboxUseCase) {}

  async process(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    requireCronSecret(request, "Job de e-mail não configurado.");
    return reply.send(await this.processOutbox.execute());
  }
}
