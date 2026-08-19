import { describe, expect, it } from "vitest";
import { PlanAccessService } from "@services/billing/application/plan-access.service";
import { UsageRepository, type BillingUsage } from "@services/billing/application/usage.repository";
import { PlanLimitExceededError } from "@services/billing/domain/errors";
import { Plan, PlanKey } from "@services/billing/domain/plan";
import {
  Subscription,
  SubscriptionStatus,
  type SubscriptionStatus as SubscriptionStatusType,
} from "@services/billing/domain/subscription";
import { SubscriptionRepository } from "@services/billing/domain/subscription.repository";
import { planLimitHttpError } from "@services/billing/infra/http/billing-error";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

class FakeSubscriptions extends SubscriptionRepository {
  current: Subscription | null = null;
  async findByCompanyId(): Promise<Subscription | null> {
    return this.current;
  }
}

class FakeUsage extends UsageRepository {
  current: BillingUsage = { rooms: 0, users: 0, bookings: 0 };
  async getUsage(): Promise<BillingUsage> {
    return this.current;
  }
}

function subscription(status: SubscriptionStatusType, planKey = PlanKey.STARTER): Subscription {
  return Subscription.restore({
    id: "22222222-2222-4222-8222-222222222222",
    companyId: COMPANY_ID,
    planKey,
    planVersion: 1,
    status,
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripePriceId: "price_123",
    currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  });
}

describe("PlanAccessService", () => {
  it("tenant sem assinatura usa plano gratuito explícito", async () => {
    const subscriptions = new FakeSubscriptions();
    const access = new PlanAccessService(subscriptions, new FakeUsage());

    const summary = await access.summary(COMPANY_ID);

    expect(summary.plan.key).toBe(PlanKey.FREE);
    expect(summary.plan.limits).toEqual({ rooms: 1, users: 1, bookings: 50 });
    expect(summary.accessMode).toBe("read_write");
  });

  it("bloqueia criação ao atingir cada limite sem apagar dados existentes", async () => {
    const subscriptions = new FakeSubscriptions();
    const usage = new FakeUsage();
    const access = new PlanAccessService(subscriptions, usage);
    const limits = Plan.of(PlanKey.FREE).limits;

    for (const resource of ["rooms", "users", "bookings"] as const) {
      usage.current = { rooms: 0, users: 0, bookings: 0, [resource]: limits[resource] };
      await expect(access.assertCanCreate(COMPANY_ID, resource)).rejects.toMatchObject({
        name: "PlanLimitExceededError",
        resource,
        limit: limits[resource],
      });
    }
  });

  it.each([
    [SubscriptionStatus.ACTIVE, "read_write", PlanKey.STARTER],
    [SubscriptionStatus.TRIALING, "read_write", PlanKey.STARTER],
    [SubscriptionStatus.INCOMPLETE, "read_write", PlanKey.FREE],
    [SubscriptionStatus.INCOMPLETE_EXPIRED, "read_write", PlanKey.FREE],
    [SubscriptionStatus.PAST_DUE, "read_only", PlanKey.FREE],
    [SubscriptionStatus.UNPAID, "read_only", PlanKey.FREE],
    [SubscriptionStatus.PAUSED, "read_only", PlanKey.FREE],
    [SubscriptionStatus.CANCELED, "read_write", PlanKey.FREE],
  ] as const)("mapeia status %s para acesso %s e plano %s", async (status, mode, plan) => {
    const subscriptions = new FakeSubscriptions();
    subscriptions.current = subscription(status);
    const access = new PlanAccessService(subscriptions, new FakeUsage());

    const summary = await access.summary(COMPANY_ID);
    expect(summary.accessMode).toBe(mode);
    expect(summary.plan.key).toBe(plan);
  });

  it("inadimplência bloqueia escrita mesmo abaixo do limite", async () => {
    const subscriptions = new FakeSubscriptions();
    subscriptions.current = subscription(SubscriptionStatus.PAST_DUE);
    const access = new PlanAccessService(subscriptions, new FakeUsage());

    await expect(access.assertCanCreate(COMPANY_ID, "rooms")).rejects.toBeInstanceOf(
      PlanLimitExceededError,
    );
  });

  it("mapeia limite para HTTP 402 com o código estável do contrato", () => {
    const error = planLimitHttpError(
      new PlanLimitExceededError(PlanKey.FREE, "rooms", 1, 1, false),
    );
    expect(error).toMatchObject({
      statusCode: 402,
      code: "PLAN_LIMIT_EXCEEDED",
      details: { planKey: "free", resource: "rooms", usage: 1, limit: 1 },
    });
  });
});
