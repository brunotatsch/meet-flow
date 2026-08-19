import { describe, expect, it } from "vitest";
import {
  BillingCheckoutResponseSchema,
  BillingSummarySchema,
  CreateBillingCheckoutSchema,
} from "@shared/schemas/billing.schema";

describe("billing schemas", () => {
  it("aceita o resumo completo de plano, assinatura, uso e opções", () => {
    const plan = {
      key: "free",
      name: "Gratuito",
      version: 1,
      limits: { rooms: 2, users: 2, bookings: 50 },
    };

    expect(
      BillingSummarySchema.parse({
        subscription: {
          status: "canceled",
          planKey: "free",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
        plan,
        usage: { rooms: 1, users: 1, bookings: 12 },
        accessMode: "read_write",
        plans: [plan],
      }),
    ).toBeTruthy();
  });

  it("recusa checkout do plano gratuito", () => {
    expect(CreateBillingCheckoutSchema.safeParse({ planKey: "free" }).success).toBe(false);
    expect(CreateBillingCheckoutSchema.safeParse({ planKey: "starter" }).success).toBe(true);
  });

  it("recusa redirect sem HTTPS", () => {
    expect(
      BillingCheckoutResponseSchema.safeParse({
        url: "javascript:alert(1)",
        sessionId: "cs_test",
        expiresAt: "2030-01-01T00:31:00.000Z",
      }).success,
    ).toBe(false);
  });
});
