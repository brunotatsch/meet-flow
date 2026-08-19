import { describe, expect, it } from "vitest";
import { CustomerPortalUseCase } from "@services/billing/application/customer-portal.use-case";
import {
  StripeGateway,
  type BookingCheckoutInput,
  type CheckoutSessionResult,
  type StripeWebhookEvent,
  type SubscriptionCheckoutInput,
} from "@services/billing/application/stripe-gateway";
import { SubscriptionCheckoutUseCase } from "@services/billing/application/subscription-checkout.use-case";
import { CheckoutUnavailableError, InvalidPlanError } from "@services/billing/domain/errors";
import { PlanKey } from "@services/billing/domain/plan";
import { Subscription, SubscriptionStatus } from "@services/billing/domain/subscription";
import { SubscriptionRepository } from "@services/billing/domain/subscription.repository";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

class FakeSubscriptions extends SubscriptionRepository {
  current: Subscription | null = null;
  async findByCompanyId(): Promise<Subscription | null> {
    return this.current;
  }
}

class BillingGateway extends StripeGateway {
  subscriptionInputs: SubscriptionCheckoutInput[] = [];
  portalInputs: Array<{ customerId: string; returnUrl: string }> = [];

  async createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<CheckoutSessionResult> {
    this.subscriptionInputs.push(input);
    return {
      id: "cs_subscription",
      url: "https://checkout.stripe.test/subscription",
      expiresAt: new Date("2026-08-01T01:00:00.000Z"),
    };
  }

  async createCustomerPortal(customerId: string, returnUrl: string): Promise<string> {
    this.portalInputs.push({ customerId, returnUrl });
    return "https://billing.stripe.test/portal";
  }

  createBookingCheckout(_input: BookingCheckoutInput): Promise<CheckoutSessionResult> {
    throw new Error("não usado");
  }
  expireCheckoutSession(_sessionId: string): Promise<void> {
    throw new Error("não usado");
  }
  verifyWebhook(_payload: Buffer, _signature: string): Promise<StripeWebhookEvent> {
    throw new Error("não usado");
  }
}

function paidSubscription(): Subscription {
  return Subscription.restore({
    id: "22222222-2222-4222-8222-222222222222",
    companyId: COMPANY_ID,
    planKey: PlanKey.STARTER,
    planVersion: 1,
    status: SubscriptionStatus.ACTIVE,
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripePriceId: "price_starter",
    currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  });
}

describe("SubscriptionCheckoutUseCase", () => {
  it("usa preço configurado no servidor e reaproveita customer do tenant", async () => {
    const subscriptions = new FakeSubscriptions();
    subscriptions.current = paidSubscription();
    const gateway = new BillingGateway();
    const useCase = new SubscriptionCheckoutUseCase(
      subscriptions,
      gateway,
      "https://meet-flow.example/",
      (plan) => `price_${plan}_server`,
    );

    const session = await useCase.execute(COMPANY_ID, "owner@exemplo.com", "pro");

    expect(session.id).toBe("cs_subscription");
    expect(gateway.subscriptionInputs[0]).toMatchObject({
      companyId: COMPANY_ID,
      planKey: "pro",
      priceId: "price_pro_server",
      customerId: "cus_123",
      successUrl:
        "https://meet-flow.example/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    });
  });

  it("recusa free ou chave desconhecida antes de chamar a Stripe", async () => {
    const gateway = new BillingGateway();
    const useCase = new SubscriptionCheckoutUseCase(
      new FakeSubscriptions(),
      gateway,
      "https://meet-flow.example",
      () => "price_never",
    );

    await expect(useCase.execute(COMPANY_ID, "owner@exemplo.com", "free")).rejects.toThrow(
      InvalidPlanError,
    );
    await expect(useCase.execute(COMPANY_ID, "owner@exemplo.com", "enterprise")).rejects.toThrow(
      InvalidPlanError,
    );
    expect(gateway.subscriptionInputs).toHaveLength(0);
  });
});

describe("CustomerPortalUseCase", () => {
  it("abre portal do customer persistido e usa retorno do próprio app", async () => {
    const subscriptions = new FakeSubscriptions();
    subscriptions.current = paidSubscription();
    const gateway = new BillingGateway();
    const useCase = new CustomerPortalUseCase(subscriptions, gateway, "https://meet-flow.example/");

    expect(await useCase.execute(COMPANY_ID)).toBe("https://billing.stripe.test/portal");
    expect(gateway.portalInputs).toEqual([
      {
        customerId: "cus_123",
        returnUrl: "https://meet-flow.example/admin/billing",
      },
    ]);
  });

  it("recusa tenant sem customer Stripe", async () => {
    const useCase = new CustomerPortalUseCase(
      new FakeSubscriptions(),
      new BillingGateway(),
      "https://meet-flow.example",
    );

    await expect(useCase.execute(COMPANY_ID)).rejects.toThrow(CheckoutUnavailableError);
  });
});
