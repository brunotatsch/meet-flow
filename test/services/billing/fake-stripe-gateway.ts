import {
  StripeGateway,
  type BookingCheckoutInput,
  type CheckoutSessionResult,
  type StripeWebhookEvent,
  type SubscriptionCheckoutInput,
} from "@services/billing/application/stripe-gateway";

/** Double determinístico compartilhado pelos e2e; nenhuma suíte alcança a rede. */
export class FakeStripeGateway extends StripeGateway {
  async createBookingCheckout(input: BookingCheckoutInput): Promise<CheckoutSessionResult> {
    return {
      id: `cs_test_${input.bookingId}`,
      url: `https://checkout.stripe.test/${input.bookingId}`,
      expiresAt: input.expiresAt,
    };
  }

  async createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<CheckoutSessionResult> {
    return {
      id: `cs_subscription_${input.companyId}`,
      url: `https://checkout.stripe.test/subscription/${input.companyId}`,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    };
  }

  async createCustomerPortal(customerId: string): Promise<string> {
    return `https://billing.stripe.test/${customerId}`;
  }

  async expireCheckoutSession(): Promise<void> {}

  async verifyWebhook(_payload: Buffer, _signature: string): Promise<StripeWebhookEvent> {
    throw new Error("Defina um evento no teste que exercita webhook.");
  }
}
