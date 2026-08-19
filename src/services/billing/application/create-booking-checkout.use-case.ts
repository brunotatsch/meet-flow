import type { Booking } from "@services/bookings/domain/booking.entity";
import type { Clock } from "@services/bookings/domain/clock";
import type { Company } from "@services/companies/domain/company";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import { CheckoutUnavailableError } from "../domain/errors";
import type { CheckoutSessionResult, StripeGateway } from "./stripe-gateway";

export interface BookingCheckoutRepository {
  attachCheckoutSession(bookingId: string, sessionId: string, now: Date): Promise<boolean>;
  cancelPendingById(bookingId: string, reason: string, now: Date): Promise<boolean>;
  confirmFreeBooking(bookingId: string, now: Date): Promise<boolean>;
}

export interface BookingPaymentAction {
  booking: Booking;
  checkout: CheckoutSessionResult | null;
}

export class CreateBookingCheckoutUseCase {
  constructor(
    private readonly gateway: StripeGateway,
    private readonly bookings: BookingCheckoutRepository,
    private readonly rooms: RoomRepository,
    private readonly clock: Clock,
    private readonly appUrl: string,
  ) {}

  async execute(booking: Booking, company: Company): Promise<BookingPaymentAction> {
    const now = this.clock.now();

    if (booking.totalInCents === 0) {
      const confirmed = await this.bookings.confirmFreeBooking(booking.id, now);
      if (!confirmed || !booking.confirm(now)) throw new CheckoutUnavailableError();
      return { booking, checkout: null };
    }

    if (!booking.expiresAt) {
      await this.bookings.cancelPendingById(booking.id, "checkout_failed", now);
      throw new CheckoutUnavailableError("Reserva sem expiração de pagamento.");
    }

    const room = await this.rooms.findById(booking.roomId, booking.companyId);
    if (!room) {
      await this.bookings.cancelPendingById(booking.id, "checkout_failed", now);
      throw new CheckoutUnavailableError();
    }

    let checkout: CheckoutSessionResult | null = null;

    try {
      checkout = await this.gateway.createBookingCheckout({
        bookingId: booking.id,
        companyId: company.id,
        companyName: company.name,
        roomName: room.name,
        customerEmail: booking.customerEmail,
        totalInCents: booking.totalInCents,
        expiresAt: booking.expiresAt,
        successUrl: publicReturnUrl(this.appUrl, company.slug, "sucesso", {
          session_id: "{CHECKOUT_SESSION_ID}",
        }),
        cancelUrl: publicReturnUrl(this.appUrl, company.slug, "cancelado", {
          booking_id: booking.id,
        }),
      });

      const attached = await this.bookings.attachCheckoutSession(booking.id, checkout.id, now);

      if (!attached) {
        throw new CheckoutUnavailableError("O hold expirou antes de iniciar o Checkout.");
      }

      booking.attachCheckoutSession(checkout.id);
      return { booking, checkout };
    } catch (error) {
      await this.bookings.cancelPendingById(booking.id, "checkout_failed", this.clock.now());
      if (checkout) await this.expireBestEffort(checkout.id);
      if (error instanceof CheckoutUnavailableError) throw error;
      throw new CheckoutUnavailableError();
    }
  }

  private async expireBestEffort(sessionId: string): Promise<void> {
    await this.gateway.expireCheckoutSession(sessionId).catch(() => undefined);
  }
}

function publicReturnUrl(
  appUrl: string,
  companySlug: string,
  outcome: "sucesso" | "cancelado",
  query: Record<string, string>,
): string {
  const base = appUrl.replace(/\/$/, "");
  const params = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${value}`)
    .join("&");
  return `${base}/${encodeURIComponent(companySlug)}/agendar/${outcome}?${params}`;
}
