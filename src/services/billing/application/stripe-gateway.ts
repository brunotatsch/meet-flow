import type { PlanKey } from "../domain/plan";

export interface BookingCheckoutInput {
  bookingId: string;
  companyId: string;
  companyName: string;
  roomName: string;
  customerEmail: string;
  totalInCents: number;
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
}

export interface SubscriptionCheckoutInput {
  companyId: string;
  planKey: Exclude<PlanKey, "free">;
  priceId: string;
  customerId: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  livemode: boolean;
  apiVersion: string | null;
  createdAt: Date;
  object: Record<string, unknown>;
}

export abstract class StripeGateway {
  abstract createBookingCheckout(input: BookingCheckoutInput): Promise<CheckoutSessionResult>;
  abstract createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<CheckoutSessionResult>;
  abstract createCustomerPortal(customerId: string, returnUrl: string): Promise<string>;
  abstract expireCheckoutSession(sessionId: string): Promise<void>;
  abstract verifyWebhook(payload: Buffer, signature: string): Promise<StripeWebhookEvent>;
}
