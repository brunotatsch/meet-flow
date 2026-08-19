import type { StripeGateway, StripeWebhookEvent } from "./stripe-gateway";

export interface StripeEventProcessor {
  processOnce(event: StripeWebhookEvent, processedAt: Date): Promise<boolean>;
}

export class ProcessStripeWebhookUseCase {
  constructor(
    private readonly gateway: StripeGateway,
    private readonly events: StripeEventProcessor,
  ) {}

  async execute(payload: Buffer, signature: string, now = new Date()): Promise<boolean> {
    const event = await this.gateway.verifyWebhook(payload, signature);
    return this.events.processOnce(event, now);
  }
}
