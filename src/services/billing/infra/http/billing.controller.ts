import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "@services/database/client";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { user } from "@services/identity/infra/database/schema/auth";
import { HttpError } from "@services/http/http-error";
import type { CustomerPortalUseCase } from "../../application/customer-portal.use-case";
import type { PlanAccessService } from "../../application/plan-access.service";
import type { SubscriptionCheckoutUseCase } from "../../application/subscription-checkout.use-case";
import { mapBillingError } from "./billing-error";

const CheckoutBodySchema = z.object({
  planKey: z.enum(["starter", "pro"]),
});

export class BillingController {
  constructor(
    private readonly access: PlanAccessService,
    private readonly checkout: SubscriptionCheckoutUseCase,
    private readonly portal: CustomerPortalUseCase,
  ) {}

  async show(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    return reply.send(await this.access.summary(companyId));
  }

  async createCheckout(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = CheckoutBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Plano inválido.", parsed.error.issues);
    }

    const auth = getRequestAuth(request);
    const [account] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, auth.userId))
      .limit(1);

    if (!account) throw new HttpError(401, "UNAUTHENTICATED", "Usuário não encontrado.");

    const session = await this.checkout
      .execute(auth.companyId, account.email, parsed.data.planKey)
      .catch(mapBillingError);

    return reply.code(201).send({
      url: session.url,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    });
  }

  async createPortal(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { companyId } = getRequestAuth(request);
    const url = await this.portal.execute(companyId).catch(mapBillingError);
    return reply.code(201).send({ url });
  }
}
