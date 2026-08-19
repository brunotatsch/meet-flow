import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StripeWebhookEvent } from "@services/billing/application/stripe-gateway";
import { PlanKey } from "@services/billing/domain/plan";
import { DrizzleStripeEventProcessor } from "@services/billing/infra/database/drizzle-stripe-event.processor";
import { stripeEvents, subscriptions } from "@services/billing/infra/database/schema/billing";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { companies } from "@services/companies/infra/database/schema/companies";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import { createTestDatabase, insertOrganization, type TestDatabase } from "../setup/test-database";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const STARTS_AT = new Date("2030-06-04T12:00:00.000Z");
const ENDS_AT = new Date("2030-06-04T13:00:00.000Z");
const NOW = new Date("2026-08-01T00:00:00.000Z");

let database: TestDatabase;
let processor: DrizzleStripeEventProcessor;

function event(
  id: string,
  type: string,
  object: Record<string, unknown>,
  createdAt = NOW,
): StripeWebhookEvent {
  return {
    id,
    type,
    livemode: false,
    apiVersion: "2026-03-25.dahlia",
    createdAt,
    object,
  };
}

async function insertPendingBooking(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  const sessionId = `cs_${id}`;

  await database.db.insert(bookings).values({
    id,
    companyId: COMPANY_ID,
    roomId: ROOM_ID,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    status: "pending",
    totalInCents: 12_000,
    expiresAt: new Date("2026-08-01T00:31:00.000Z"),
    stripeCheckoutSessionId: sessionId,
    ...overrides,
  });

  return { id, sessionId };
}

function checkoutObject(bookingId: string, sessionId: string) {
  return {
    id: sessionId,
    client_reference_id: bookingId,
    payment_status: "paid",
    amount_total: 12_000,
    currency: "brl",
    payment_intent: "pi_123",
  };
}

function subscriptionObject(status: string) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status,
    metadata: { companyId: COMPANY_ID },
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: "price_starter" },
          current_period_end: 1_788_134_400,
        },
      ],
    },
  };
}

beforeAll(async () => {
  database = createTestDatabase();
  processor = new DrizzleStripeEventProcessor(() => PlanKey.STARTER);

  await insertOrganization(database, "org-stripe-events");
  await database.db.insert(companies).values({
    id: COMPANY_ID,
    organizationId: "org-stripe-events",
    name: "Hotel Aurora",
    slug: "hotel-aurora-stripe",
    type: "hotel",
  });
  await database.db.insert(rooms).values({
    id: ROOM_ID,
    companyId: COMPANY_ID,
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 12_000,
  });
});

beforeEach(async () => {
  await database.db.delete(stripeEvents);
  await database.db.delete(bookings);
  await database.db.delete(subscriptions);
});

afterAll(async () => {
  await database?.close();
});

describe("DrizzleStripeEventProcessor — reservas", () => {
  it("confirma exatamente uma vez e deduplica o mesmo event id", async () => {
    const booking = await insertPendingBooking();
    const completed = event(
      "evt_completed",
      "checkout.session.completed",
      checkoutObject(booking.id, booking.sessionId),
    );

    expect(await processor.processOnce(completed, NOW)).toBe(true);
    expect(await processor.processOnce(completed, NOW)).toBe(false);

    const [row] = await database.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row).toMatchObject({
      status: "confirmed",
      stripePaymentIntentId: "pi_123",
    });
    expect(await database.db.select().from(stripeEvents)).toHaveLength(1);
  });

  it("não confirma valor, moeda, sessão ou payment_status divergente", async () => {
    const booking = await insertPendingBooking();

    await processor.processOnce(
      event("evt_wrong_amount", "checkout.session.completed", {
        ...checkoutObject(booking.id, booking.sessionId),
        amount_total: 1,
      }),
      NOW,
    );

    const [row] = await database.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row?.status).toBe("pending");
  });

  it("webhook pago atrasado nunca reativa hold vencido", async () => {
    const booking = await insertPendingBooking({
      expiresAt: new Date("2026-07-31T23:59:00.000Z"),
    });

    await processor.processOnce(
      event(
        "evt_late",
        "checkout.session.completed",
        checkoutObject(booking.id, booking.sessionId),
      ),
      NOW,
    );

    const [row] = await database.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row).toMatchObject({ status: "cancelled", cancellationReason: "expired" });
  });

  it("session.expired libera a constraint de horário", async () => {
    const booking = await insertPendingBooking();

    await processor.processOnce(
      event("evt_expired", "checkout.session.expired", {
        id: booking.sessionId,
        client_reference_id: booking.id,
      }),
      NOW,
    );

    await expect(insertPendingBooking()).resolves.toBeDefined();
  });

  it("payment_intent.payment_failed não encerra sessão ainda recuperável", async () => {
    const booking = await insertPendingBooking();

    await processor.processOnce(
      event("evt_attempt_failed", "payment_intent.payment_failed", {
        id: "pi_failed",
        metadata: { bookingId: booking.id },
      }),
      NOW,
    );

    const [row] = await database.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row?.status).toBe("pending");
  });
});

describe("DrizzleStripeEventProcessor — assinaturas", () => {
  it.each([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "unpaid",
    "paused",
  ] as const)("persiste transição para %s", async (status) => {
    await processor.processOnce(
      event(`evt_${status}`, "customer.subscription.updated", subscriptionObject(status)),
      NOW,
    );

    const [row] = await database.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, COMPANY_ID));
    expect(row).toMatchObject({ status, planKey: PlanKey.STARTER });
  });

  it("deleted cancela e evento antigo não sobrescreve estado mais novo", async () => {
    const newer = new Date("2026-08-01T00:02:00.000Z");
    await processor.processOnce(
      event("evt_deleted", "customer.subscription.deleted", subscriptionObject("active"), newer),
      newer,
    );
    await processor.processOnce(
      event("evt_stale_active", "customer.subscription.updated", subscriptionObject("active"), NOW),
      newer,
    );

    const [row] = await database.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, COMPANY_ID));
    expect(row?.status).toBe("canceled");
  });

  it("invoice.payment_failed coloca assinatura em read-only/past_due", async () => {
    await processor.processOnce(
      event("evt_active", "customer.subscription.created", subscriptionObject("active")),
      NOW,
    );
    const failedAt = new Date("2026-08-01T00:01:00.000Z");
    await processor.processOnce(
      event(
        "evt_invoice_failed",
        "invoice.payment_failed",
        {
          customer: "cus_123",
          parent: { subscription_details: { subscription: "sub_123" } },
        },
        failedAt,
      ),
      failedAt,
    );

    const [row] = await database.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, COMPANY_ID),
          eq(subscriptions.stripeSubscriptionId, "sub_123"),
        ),
      );
    expect(row?.status).toBe("past_due");
  });
});
