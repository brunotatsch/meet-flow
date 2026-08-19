import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { EmailMessage } from "../../../domain/email-sender";
import { bookings } from "@services/bookings/infra/database/schema/bookings";

export const emailOutboxKind = pgEnum("email_outbox_kind", [
  "booking_confirmation_customer",
  "booking_new_company",
  "booking_cancellation_customer",
  "booking_reminder_customer",
  "generic",
]);

export const emailOutboxStatus = pgEnum("email_outbox_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "dead",
]);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: emailOutboxKind().notNull(),
    bookingId: uuid().references(() => bookings.id, { onDelete: "cascade" }),
    payload: jsonb().$type<Omit<EmailMessage, "idempotencyKey"> | null>(),
    dedupeKey: text().notNull(),
    status: emailOutboxStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    providerMessageId: text(),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("email_outbox_dedupe_key_unique").on(table.dedupeKey),
    index("email_outbox_booking_id_idx").on(table.bookingId),
    index("email_outbox_due_idx")
      .on(table.status, table.nextAttemptAt)
      .where(sql`${table.status} IN ('pending', 'failed', 'processing')`),
    check("email_outbox_attempts_non_negative", sql`${table.attempts} >= 0`),
    check(
      "email_outbox_source_valid",
      sql`(
        (${table.kind} = 'generic' AND ${table.bookingId} IS NULL AND ${table.payload} IS NOT NULL)
        OR
        (${table.kind} <> 'generic' AND ${table.bookingId} IS NOT NULL AND ${table.payload} IS NULL)
      )`,
    ),
  ],
);
