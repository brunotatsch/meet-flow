import { describe, expect, it } from "vitest";
import {
  ProcessStripeWebhookUseCase,
  type StripeEventProcessor,
} from "@services/billing/application/process-stripe-webhook.use-case";
import {
  StripeGateway,
  type BookingCheckoutInput,
  type CheckoutSessionResult,
  type StripeWebhookEvent,
  type SubscriptionCheckoutInput,
} from "@services/billing/application/stripe-gateway";
import { InvalidWebhookSignatureError } from "@services/billing/domain/errors";

const event: StripeWebhookEvent = {
  id: "evt_123",
  type: "checkout.session.completed",
  livemode: false,
  apiVersion: "2026-03-25.dahlia",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  object: { id: "cs_123" },
};

class WebhookGateway extends StripeGateway {
  failure: Error | null = null;
  verifyWebhook(_payload: Buffer, _signature: string): Promise<StripeWebhookEvent> {
    return this.failure ? Promise.reject(this.failure) : Promise.resolve(event);
  }
  createBookingCheckout(_input: BookingCheckoutInput): Promise<CheckoutSessionResult> {
    throw new Error("não usado");
  }
  createSubscriptionCheckout(_input: SubscriptionCheckoutInput): Promise<CheckoutSessionResult> {
    throw new Error("não usado");
  }
  createCustomerPortal(_customerId: string, _returnUrl: string): Promise<string> {
    throw new Error("não usado");
  }
  expireCheckoutSession(_sessionId: string): Promise<void> {
    throw new Error("não usado");
  }
}

class EventProcessor implements StripeEventProcessor {
  events: StripeWebhookEvent[] = [];
  result = true;
  async processOnce(item: StripeWebhookEvent): Promise<boolean> {
    this.events.push(item);
    return this.result;
  }
}

describe("ProcessStripeWebhookUseCase", () => {
  it("só entrega evento verificado ao ledger durável", async () => {
    const gateway = new WebhookGateway();
    const processor = new EventProcessor();
    const useCase = new ProcessStripeWebhookUseCase(gateway, processor);

    expect(await useCase.execute(Buffer.from("{}"), "t=1,v1=sig")).toBe(true);
    expect(processor.events).toEqual([event]);
  });

  it("propaga assinatura inválida sem tocar no estado", async () => {
    const gateway = new WebhookGateway();
    gateway.failure = new InvalidWebhookSignatureError();
    const processor = new EventProcessor();
    const useCase = new ProcessStripeWebhookUseCase(gateway, processor);

    await expect(useCase.execute(Buffer.from("{}"), "invalid")).rejects.toThrow(
      InvalidWebhookSignatureError,
    );
    expect(processor.events).toHaveLength(0);
  });

  it("expõe duplicata como false sem repetir semântica no caso de uso", async () => {
    const gateway = new WebhookGateway();
    const processor = new EventProcessor();
    processor.result = false;

    expect(
      await new ProcessStripeWebhookUseCase(gateway, processor).execute(Buffer.from("{}"), "valid"),
    ).toBe(false);
  });
});
