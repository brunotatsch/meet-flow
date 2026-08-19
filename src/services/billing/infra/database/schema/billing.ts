import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "@services/companies/infra/database/schema/companies";

export const subscriptionStatus = pgEnum("subscription_status", [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    planKey: text().notNull(),
    planVersion: integer().notNull(),
    status: subscriptionStatus().notNull(),
    stripeCustomerId: text(),
    stripeSubscriptionId: text(),
    stripePriceId: text(),
    currentPeriodEnd: timestamp({ withTimezone: true }),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    /** Carimbo do evento Stripe mais novo aplicado; protege contra entrega fora de ordem. */
    stripeUpdatedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("subscriptions_company_id_unique").on(table.companyId),
    unique("subscriptions_stripe_customer_id_unique").on(table.stripeCustomerId),
    unique("subscriptions_stripe_subscription_id_unique").on(table.stripeSubscriptionId),
    index("subscriptions_status_idx").on(table.status),
    check("subscriptions_plan_key_known", sql`${table.planKey} IN ('free', 'starter', 'pro')`),
    check("subscriptions_plan_version_positive", sql`${table.planVersion} > 0`),
  ],
);

/**
 * Ledger mínimo e durável de idempotência. O payload não é persistido para não
 * duplicar PII de clientes; id, tipo e carimbos bastam para deduplicação/auditoria.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  livemode: boolean().notNull(),
  apiVersion: text(),
  stripeCreatedAt: timestamp({ withTimezone: true }).notNull(),
  processedAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
