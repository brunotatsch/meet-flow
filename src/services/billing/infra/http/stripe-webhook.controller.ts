import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "@services/http/http-error";
import type { ProcessStripeWebhookUseCase } from "../../application/process-stripe-webhook.use-case";
import { mapBillingError } from "./billing-error";

export class StripeWebhookController {
  constructor(private readonly processWebhook: ProcessStripeWebhookUseCase) {}

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string" || !Buffer.isBuffer(request.body)) {
      throw new HttpError(400, "INVALID_STRIPE_SIGNATURE", "Webhook Stripe inválido.");
    }

    const processed = await this.processWebhook
      .execute(request.body, signature)
      .catch(mapBillingError);

    return reply.send({ received: true, duplicate: !processed });
  }
}
