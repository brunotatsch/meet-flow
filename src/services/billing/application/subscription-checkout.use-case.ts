import { InvalidPlanError } from "../domain/errors";
import { Plan, PlanKey, type PlanKey as PlanKeyType } from "../domain/plan";
import type { SubscriptionRepository } from "../domain/subscription.repository";
import { stripePriceForPlan } from "../infra/stripe/stripe-config";
import type { CheckoutSessionResult, StripeGateway } from "./stripe-gateway";

type PaidPlanKey = Exclude<PlanKeyType, "free">;

export class SubscriptionCheckoutUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: StripeGateway,
    private readonly appUrl: string,
    private readonly priceForPlan: (planKey: PaidPlanKey) => string = stripePriceForPlan,
  ) {}

  async execute(
    companyId: string,
    customerEmail: string,
    planKey: string,
  ): Promise<CheckoutSessionResult> {
    if (!Plan.isPlanKey(planKey) || planKey === PlanKey.FREE) {
      throw new InvalidPlanError(planKey);
    }

    const paidPlan = planKey as PaidPlanKey;
    const current = await this.subscriptions.findByCompanyId(companyId);
    const base = this.appUrl.replace(/\/$/, "");

    return this.gateway.createSubscriptionCheckout({
      companyId,
      customerEmail,
      customerId: current?.stripeCustomerId ?? null,
      planKey: paidPlan,
      priceId: this.priceForPlan(paidPlan),
      successUrl: `${base}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/admin/billing?checkout=cancelled`,
    });
  }
}
