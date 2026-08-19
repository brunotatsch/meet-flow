import type { FastifyReply, FastifyRequest } from "fastify";
import { BookingStatus } from "@shared/enums/booking-status";
import { getPublicCompany } from "@services/companies/infra/http/resolve-company-slug";
import { HttpError } from "@services/http/http-error";
import type { DrizzleBookingRepository } from "@services/bookings/infra/database/drizzle-booking.repository";
import { toBookingResponse } from "@services/bookings/infra/http/booking-response";

interface CheckoutParams {
  Params: { sessionId: string };
}

export class PublicCheckoutController {
  constructor(private readonly bookings: DrizzleBookingRepository) {}

  async show(request: FastifyRequest<CheckoutParams>, reply: FastifyReply): Promise<FastifyReply> {
    const company = getPublicCompany(request);
    let booking = await this.bookings.findByCheckoutSession(request.params.sessionId, company.id);

    if (!booking) {
      throw new HttpError(404, "CHECKOUT_SESSION_NOT_FOUND", "Checkout não encontrado.");
    }

    if (
      booking.status === BookingStatus.PENDING &&
      booking.expiresAt &&
      booking.expiresAt.getTime() <= Date.now()
    ) {
      await this.bookings.expirePending(new Date(), company.id, booking.roomId);
      booking =
        (await this.bookings.findByCheckoutSession(request.params.sessionId, company.id)) ??
        booking;
    }

    const response = toBookingResponse(booking, company.timezone);

    return reply.send({
      state: checkoutState(booking.status, booking.cancellationReason),
      booking: {
        id: response.id,
        roomId: response.roomId,
        startsAt: response.startsAt,
        endsAt: response.endsAt,
        status: response.status,
        totalInCents: response.totalInCents,
      },
      timeZone: company.timezone,
    });
  }
}

function checkoutState(
  status: BookingStatus,
  cancellationReason: string | null,
): "processing" | "confirmed" | "expired" | "payment_failed" {
  if (status === BookingStatus.CONFIRMED || status === BookingStatus.COMPLETED) {
    return "confirmed";
  }
  if (status === BookingStatus.PENDING) return "processing";
  return cancellationReason === "payment_failed" ? "payment_failed" : "expired";
}
