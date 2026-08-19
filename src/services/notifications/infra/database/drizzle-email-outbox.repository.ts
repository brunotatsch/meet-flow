import { and, eq, inArray, sql } from "drizzle-orm";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { member, user } from "@services/identity/infra/database/schema/auth";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import { BookingEmailEventKind } from "../../domain/booking-email-event";
import type { EmailMessage } from "../../domain/email-sender";
import {
  EmailOutboxRepository,
  type BookingEmailContext,
  type EmailOutboxEvent,
} from "../../application/email-outbox.repository";
import { emailOutbox } from "./schema/email-outbox";

type ClaimedRow = Record<string, unknown> & {
  id: string;
  kind: string;
  bookingId: string | null;
  attempts: number;
  payload: Omit<EmailMessage, "idempotencyKey"> | null;
};

export class DrizzleEmailOutboxRepository extends EmailOutboxRepository {
  async claimDue(now: Date, limit: number): Promise<EmailOutboxEvent[]> {
    const rows = await db.execute<ClaimedRow>(sql`
      WITH due AS (
        SELECT id
        FROM email_outbox
        WHERE (
          status IN ('pending', 'failed')
          AND next_attempt_at <= ${now}
        ) OR (
          status = 'processing'
          AND locked_at <= ${new Date(now.getTime() - 10 * 60_000)}
        )
        ORDER BY next_attempt_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE email_outbox AS outbox
      SET status = 'processing',
          attempts = outbox.attempts + 1,
          locked_at = ${now},
          updated_at = ${now}
      FROM due
      WHERE outbox.id = due.id
      RETURNING
        outbox.id,
        outbox.kind::text AS "kind",
        outbox.booking_id AS "bookingId",
        outbox.attempts,
        outbox.payload
    `);

    return rows.map((row) => ({
      id: row.id,
      kind: parseKind(row.kind),
      bookingId: row.bookingId,
      attempts: row.attempts,
      payload: row.payload,
    }));
  }

  async loadBookingContext(bookingId: string): Promise<BookingEmailContext | null> {
    const [row] = await db
      .select({
        bookingId: bookings.id,
        status: bookings.status,
        customerName: bookings.customerName,
        customerEmail: bookings.customerEmail,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        totalInCents: bookings.totalInCents,
        companyId: companies.id,
        companyName: companies.name,
        companySlug: companies.slug,
        timezone: companies.timezone,
        organizationId: companies.organizationId,
        roomName: rooms.name,
      })
      .from(bookings)
      .innerJoin(companies, eq(companies.id, bookings.companyId))
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!row) return null;

    const recipients = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, row.organizationId),
          inArray(member.role, ["owner", "manager"]),
        ),
      );

    return {
      bookingId: row.bookingId,
      status: row.status,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      totalInCents: row.totalInCents,
      companyId: row.companyId,
      companyName: row.companyName,
      companySlug: row.companySlug,
      timezone: row.timezone,
      roomName: row.roomName,
      companyRecipients: [...new Set(recipients.map(({ email }) => email))],
    };
  }

  async markDelivered(
    id: string,
    providerMessageId: string | null,
    deliveredAt: Date,
  ): Promise<void> {
    await db
      .update(emailOutbox)
      .set({
        status: "sent",
        providerMessageId,
        deliveredAt,
        lockedAt: null,
        lastError: null,
        updatedAt: deliveredAt,
      })
      .where(eq(emailOutbox.id, id));
  }

  async markSkipped(id: string, reason: string, now: Date): Promise<void> {
    await db
      .update(emailOutbox)
      .set({
        status: "sent",
        providerMessageId: "skipped",
        deliveredAt: now,
        lockedAt: null,
        lastError: reason,
        updatedAt: now,
      })
      .where(eq(emailOutbox.id, id));
  }

  async markFailed(input: {
    id: string;
    error: string;
    nextAttemptAt: Date;
    dead: boolean;
    now: Date;
  }): Promise<void> {
    await db
      .update(emailOutbox)
      .set({
        status: input.dead ? "dead" : "failed",
        nextAttemptAt: input.nextAttemptAt,
        lockedAt: null,
        lastError: input.error,
        updatedAt: input.now,
      })
      .where(eq(emailOutbox.id, input.id));
  }

  async enqueueMessage(input: {
    dedupeKey: string;
    message: Omit<EmailMessage, "idempotencyKey">;
    availableAt?: Date;
  }): Promise<boolean> {
    const rows = await db
      .insert(emailOutbox)
      .values({
        kind: BookingEmailEventKind.GENERIC,
        bookingId: null,
        payload: input.message,
        dedupeKey: input.dedupeKey,
        nextAttemptAt: input.availableAt ?? new Date(),
      })
      .onConflictDoNothing({ target: emailOutbox.dedupeKey })
      .returning({ id: emailOutbox.id });
    return rows.length === 1;
  }
}

function parseKind(value: string): EmailOutboxEvent["kind"] {
  if (Object.values(BookingEmailEventKind).includes(value as BookingEmailEventKind)) {
    return value as BookingEmailEventKind;
  }
  throw new Error(`Tipo de evento de e-mail desconhecido: ${value}`);
}
