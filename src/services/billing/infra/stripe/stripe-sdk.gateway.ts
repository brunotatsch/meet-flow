import Stripe from "stripe";
import {
  StripeGateway,
  type BookingCheckoutInput,
  type CheckoutSessionResult,
  type StripeWebhookEvent,
  type SubscriptionCheckoutInput,
} from "../../application/stripe-gateway";
import { CheckoutUnavailableError, InvalidWebhookSignatureError } from "../../domain/errors";
import { loadStripeConfiguration } from "./stripe-config";

/**
 * Adapter fino sobre o SDK oficial. O cliente e os segredos são carregados
 * preguiçosamente: importar/buildar a função não faz rede nem exige configuração.
 */
export class StripeSdkGateway extends StripeGateway {
  private stripeClient?: Stripe;

  private client(): Stripe {
    return (this.stripeClient ??= new Stripe(loadStripeConfiguration().secretKey));
  }

  async createBookingCheckout(input: BookingCheckoutInput): Promise<CheckoutSessionResult> {
    const session = await this.client().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: input.bookingId,
        customer_email: input.customerEmail,
        expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { bookingId: input.bookingId, companyId: input.companyId },
        payment_intent_data: {
          metadata: { bookingId: input.bookingId, companyId: input.companyId },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: input.totalInCents,
              product_data: {
                name: `Reserva — ${input.roomName}`,
                description: input.companyName,
              },
            },
          },
        ],
      },
      { idempotencyKey: `booking-checkout:${input.bookingId}` },
    );

    return checkoutResult(session);
  }

  async createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<CheckoutSessionResult> {
    const session = await this.client().checkout.sessions.create(
      {
        mode: "subscription",
        client_reference_id: input.companyId,
        ...(input.customerId
          ? { customer: input.customerId }
          : { customer_email: input.customerEmail }),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { companyId: input.companyId, planKey: input.planKey },
        subscription_data: {
          metadata: { companyId: input.companyId, planKey: input.planKey },
        },
        line_items: [{ price: input.priceId, quantity: 1 }],
      },
      { idempotencyKey: `subscription-checkout:${input.companyId}:${input.planKey}` },
    );

    return checkoutResult(session);
  }

  async createCustomerPortal(customerId: string, returnUrl: string): Promise<string> {
    const portal = await this.client().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return portal.url;
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.client().checkout.sessions.expire(sessionId);
  }

  async verifyWebhook(payload: Buffer, signature: string): Promise<StripeWebhookEvent> {
    let event: Stripe.Event;
    try {
      event = await this.client().webhooks.constructEventAsync(
        payload,
        signature,
        loadStripeConfiguration().webhookSecret,
      );
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new InvalidWebhookSignatureError();
      }
      throw error;
    }

    return {
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      apiVersion: event.api_version ?? null,
      createdAt: new Date(event.created * 1_000),
      object: event.data.object as unknown as Record<string, unknown>,
    };
  }
}

function checkoutResult(session: Stripe.Checkout.Session): CheckoutSessionResult {
  if (!session.url) {
    throw new CheckoutUnavailableError("A Stripe criou uma sessão sem URL de Checkout.");
  }

  return {
    id: session.id,
    url: session.url,
    expiresAt: new Date(session.expires_at * 1_000),
  };
}
