import { and, eq, gt, inArray, isNotNull, lte, or } from "drizzle-orm";
import { BookingStatus } from "@shared/enums/booking-status";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { db } from "@services/database/client";
import type { StripeEventProcessor } from "../../application/process-stripe-webhook.use-case";
import type { StripeWebhookEvent } from "../../application/stripe-gateway";
import { PLAN_CATALOG_VERSION, Plan, type PlanKey } from "../../domain/plan";
import {
  SubscriptionStatus,
  type SubscriptionStatus as SubscriptionStatusType,
} from "../../domain/subscription";
import { planForStripePrice } from "../stripe/stripe-config";
import { stripeEvents, subscriptions } from "./schema/billing";

type PriceToPlan = (priceId: string) => PlanKey | null;

/**
 * O insert no ledger e a transição de negócio compartilham a mesma transação.
 * Se qualquer atualização falhar, o id do evento também dá rollback e a Stripe
 * pode reenviar; se já existir, nenhum efeito colateral volta a rodar.
 */
export class DrizzleStripeEventProcessor implements StripeEventProcessor {
  constructor(private readonly priceToPlan: PriceToPlan = planForStripePrice) {}

  async processOnce(event: StripeWebhookEvent, processedAt: Date): Promise<boolean> {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(stripeEvents)
        .values({
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          apiVersion: event.apiVersion,
          stripeCreatedAt: event.createdAt,
          processedAt,
        })
        .onConflictDoNothing({ target: stripeEvents.id })
        .returning({ id: stripeEvents.id });

      if (inserted.length === 0) return false;

      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
          await confirmPaidBooking(tx, event.object, processedAt);
          break;
        case "checkout.session.expired":
          await cancelTerminalBooking(tx, event.object, "expired", processedAt);
          break;
        case "checkout.session.async_payment_failed":
          await cancelTerminalBooking(tx, event.object, "payment_failed", processedAt);
          break;
        case "payment_intent.payment_failed":
          // Falha de tentativa não é terminal: Checkout ainda permite trocar o cartão.
          // O ledger registra que o evento foi tratado, mas o hold permanece até
          // session.expired/async_payment_failed ou a expiração lazy.
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await upsertSubscription(
            tx,
            event.object,
            event.type === "customer.subscription.deleted" ? SubscriptionStatus.CANCELED : null,
            event.createdAt,
            this.priceToPlan,
          );
          break;
        case "invoice.payment_failed":
          await markSubscriptionPastDue(tx, event.object, event.createdAt);
          break;
      }

      return true;
    });
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function confirmPaidBooking(
  tx: Transaction,
  object: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const sessionId = stringId(object.id);
  const bookingId = optionalString(object.client_reference_id);
  const paymentStatus = optionalString(object.payment_status);
  const amountTotal = optionalNumber(object.amount_total);
  const currency = optionalString(object.currency);

  if (!sessionId || !bookingId || paymentStatus !== "paid") return;

  const [booking] = await tx
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .for("update")
    .limit(1);

  if (!booking || booking.status !== BookingStatus.PENDING) return;

  if (
    booking.stripeCheckoutSessionId !== sessionId ||
    amountTotal !== booking.totalInCents ||
    currency?.toLowerCase() !== "brl"
  ) {
    return;
  }

  if (!booking.expiresAt || booking.expiresAt.getTime() <= now.getTime()) {
    await tx
      .update(bookings)
      .set({
        status: BookingStatus.CANCELLED,
        cancellationReason: "expired",
        updatedAt: now,
      })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, BookingStatus.PENDING)));
    return;
  }

  await tx
    .update(bookings)
    .set({
      status: BookingStatus.CONFIRMED,
      confirmedAt: now,
      stripePaymentIntentId: nestedId(object.payment_intent),
      updatedAt: now,
    })
    .where(
      and(
        eq(bookings.id, booking.id),
        eq(bookings.status, BookingStatus.PENDING),
        isNotNull(bookings.expiresAt),
        gt(bookings.expiresAt, now),
      ),
    );
}

async function cancelTerminalBooking(
  tx: Transaction,
  object: Record<string, unknown>,
  reason: "expired" | "payment_failed",
  now: Date,
): Promise<void> {
  const sessionId = stringId(object.id);
  const bookingId = optionalString(object.client_reference_id);
  if (!sessionId || !bookingId) return;

  await tx
    .update(bookings)
    .set({ status: BookingStatus.CANCELLED, cancellationReason: reason, updatedAt: now })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.stripeCheckoutSessionId, sessionId),
        eq(bookings.status, BookingStatus.PENDING),
      ),
    );
}

async function upsertSubscription(
  tx: Transaction,
  object: Record<string, unknown>,
  forcedStatus: SubscriptionStatusType | null,
  eventCreatedAt: Date,
  priceToPlan: PriceToPlan,
): Promise<void> {
  const stripeSubscriptionId = stringId(object.id);
  if (!stripeSubscriptionId) return;

  const existing = await tx
    .select()
    .from(subscriptions)
    .where(
      or(
        eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
        companyIdFromMetadata(object)
          ? eq(subscriptions.companyId, companyIdFromMetadata(object)!)
          : undefined,
      ),
    )
    .for("update")
    .limit(1);

  const companyId = companyIdFromMetadata(object) ?? existing[0]?.companyId ?? null;
  const priceId = subscriptionPriceId(object) ?? existing[0]?.stripePriceId ?? null;
  const planKey = priceId ? priceToPlan(priceId) : existing[0]?.planKey;
  const status = forcedStatus ?? subscriptionStatusOf(object.status);

  if (!companyId || !priceId || !planKey || !Plan.isPlanKey(planKey) || !status) return;
  if (existing[0] && existing[0].stripeUpdatedAt.getTime() > eventCreatedAt.getTime()) return;

  const values = {
    companyId,
    planKey,
    planVersion: PLAN_CATALOG_VERSION,
    status,
    stripeCustomerId: nestedId(object.customer) ?? existing[0]?.stripeCustomerId ?? null,
    stripeSubscriptionId,
    stripePriceId: priceId,
    currentPeriodEnd: subscriptionPeriodEnd(object) ?? existing[0]?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    stripeUpdatedAt: eventCreatedAt,
    updatedAt: eventCreatedAt,
  };

  await tx
    .insert(subscriptions)
    .values({ ...values, createdAt: eventCreatedAt })
    .onConflictDoUpdate({
      target: subscriptions.companyId,
      set: values,
      setWhere: lte(subscriptions.stripeUpdatedAt, eventCreatedAt),
    });
}

async function markSubscriptionPastDue(
  tx: Transaction,
  object: Record<string, unknown>,
  eventCreatedAt: Date,
): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(object);
  const customerId = nestedId(object.customer);
  if (!subscriptionId && !customerId) return;

  await tx
    .update(subscriptions)
    .set({
      status: SubscriptionStatus.PAST_DUE,
      stripeUpdatedAt: eventCreatedAt,
      updatedAt: eventCreatedAt,
    })
    .where(
      and(
        subscriptionId
          ? eq(subscriptions.stripeSubscriptionId, subscriptionId)
          : eq(subscriptions.stripeCustomerId, customerId!),
        inArray(subscriptions.status, [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ]),
        lte(subscriptions.stripeUpdatedAt, eventCreatedAt),
      ),
    );
}

function companyIdFromMetadata(object: Record<string, unknown>): string | null {
  return optionalString(record(object.metadata)?.companyId);
}

function subscriptionPriceId(object: Record<string, unknown>): string | null {
  const data = record(object.items)?.data;
  if (!Array.isArray(data)) return null;
  const firstItem = record(data[0]);
  return optionalString(record(firstItem?.price)?.id);
}

function subscriptionPeriodEnd(object: Record<string, unknown>): Date | null {
  const data = record(object.items)?.data;
  if (!Array.isArray(data)) return null;
  const epoch = optionalNumber(record(data[0])?.current_period_end);
  return epoch === null ? null : new Date(epoch * 1_000);
}

function invoiceSubscriptionId(object: Record<string, unknown>): string | null {
  const details = record(record(object.parent)?.subscription_details);
  return nestedId(details?.subscription);
}

function subscriptionStatusOf(value: unknown): SubscriptionStatusType | null {
  return Object.values(SubscriptionStatus).includes(value as SubscriptionStatusType)
    ? (value as SubscriptionStatusType)
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedId(value: unknown): string | null {
  return optionalString(value) ?? optionalString(record(value)?.id);
}

function stringId(value: unknown): string | null {
  const id = optionalString(value);
  return id && id.length <= 255 ? id : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
