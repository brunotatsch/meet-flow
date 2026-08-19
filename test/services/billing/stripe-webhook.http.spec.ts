import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { StripeEventProcessor } from "@services/billing/application/process-stripe-webhook.use-case";
import type { StripeWebhookEvent } from "@services/billing/application/stripe-gateway";
import { InvalidWebhookSignatureError } from "@services/billing/domain/errors";
import { buildServer } from "@services/http/server";
import { FakeStripeGateway } from "./fake-stripe-gateway";

const normalizedEvent: StripeWebhookEvent = {
  id: "evt_123",
  type: "checkout.session.completed",
  livemode: false,
  apiVersion: "2026-03-25.dahlia",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  object: {},
};

class CapturingGateway extends FakeStripeGateway {
  payload?: Buffer;
  signature?: string;
  failure: Error | null = null;

  override async verifyWebhook(payload: Buffer, signature: string): Promise<StripeWebhookEvent> {
    this.payload = payload;
    this.signature = signature;
    if (this.failure) throw this.failure;
    return normalizedEvent;
  }
}

class CapturingProcessor implements StripeEventProcessor {
  events: StripeWebhookEvent[] = [];
  result = true;

  async processOnce(event: StripeWebhookEvent): Promise<boolean> {
    this.events.push(event);
    return this.result;
  }
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("POST /api/v1/webhooks/stripe", () => {
  it("entrega ao verificador exatamente os bytes crus recebidos", async () => {
    const gateway = new CapturingGateway();
    const processor = new CapturingProcessor();
    app = buildServer({
      api: { billing: { stripeGateway: gateway, stripeEventProcessor: processor } },
      security: { globalRateLimit: false },
    });
    const rawBody = '{ "id": "evt_123",  "data": { "object": {} } }';

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1787145600,v1=assinatura",
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(gateway.payload?.toString("utf8")).toBe(rawBody);
    expect(gateway.signature).toBe("t=1787145600,v1=assinatura");
    expect(processor.events).toEqual([normalizedEvent]);
  });

  it("responde 400 e não toca o ledger com assinatura inválida", async () => {
    const gateway = new CapturingGateway();
    gateway.failure = new InvalidWebhookSignatureError();
    const processor = new CapturingProcessor();
    app = buildServer({
      api: { billing: { stripeGateway: gateway, stripeEventProcessor: processor } },
      security: { globalRateLimit: false },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "invalid",
      },
      payload: "{}",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_STRIPE_SIGNATURE");
    expect(processor.events).toHaveLength(0);
  });

  it("expõe replay idempotente como duplicate sem erro HTTP", async () => {
    const gateway = new CapturingGateway();
    const processor = new CapturingProcessor();
    processor.result = false;
    app = buildServer({
      api: { billing: { stripeGateway: gateway, stripeEventProcessor: processor } },
      security: { globalRateLimit: false },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": "valid" },
      payload: "{}",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, duplicate: true });
  });
});
