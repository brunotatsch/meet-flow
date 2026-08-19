import { PlanLimitExceededError } from "../domain/errors";
import { allPlans, type LimitedResource, type PlanLimits, type PlanKey } from "../domain/plan";
import { Subscription } from "../domain/subscription";
import type { SubscriptionRepository } from "../domain/subscription.repository";
import type { BillingUsage, UsageRepository } from "./usage.repository";

export interface BillingSummary {
  subscription: {
    status: Subscription["status"];
    planKey: PlanKey;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
  plan: {
    key: PlanKey;
    name: string;
    version: number;
    limits: Readonly<PlanLimits>;
  };
  usage: BillingUsage;
  accessMode: "read_write" | "read_only";
  plans: Array<{
    key: PlanKey;
    name: string;
    version: number;
    limits: Readonly<PlanLimits>;
  }>;
}

export class PlanAccessService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly usage: UsageRepository,
  ) {}

  async summary(companyId: string, now = new Date()): Promise<BillingSummary> {
    const subscription =
      (await this.subscriptions.findByCompanyId(companyId)) ?? Subscription.free(companyId);
    const plan = subscription.effectivePlan;
    const usage = await this.usage.getUsage(companyId, now);

    return {
      subscription: {
        status: subscription.status,
        planKey: subscription.planKey,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan: {
        key: plan.key,
        name: plan.name,
        version: plan.version,
        limits: plan.limits,
      },
      usage,
      accessMode: subscription.isReadOnly ? "read_only" : "read_write",
      plans: allPlans().map((item) => ({
        key: item.key,
        name: item.name,
        version: item.version,
        limits: item.limits,
      })),
    };
  }

  async assertCanCreate(
    companyId: string,
    resource: LimitedResource,
    now = new Date(),
  ): Promise<void> {
    const subscription =
      (await this.subscriptions.findByCompanyId(companyId)) ?? Subscription.free(companyId);
    const plan = subscription.effectivePlan;
    const limit = plan.limitFor(resource);
    const current = await this.usage.count(companyId, resource, now);

    if (subscription.isReadOnly || current >= limit) {
      throw new PlanLimitExceededError(plan.key, resource, current, limit, subscription.isReadOnly);
    }
  }
}
