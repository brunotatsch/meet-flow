import type { BookingStatus } from "@shared/enums/booking-status";
import type { BookingEmailEventKind } from "../domain/booking-email-event";
import type { EmailMessage } from "../domain/email-sender";

export interface EmailOutboxEvent {
  id: string;
  kind: BookingEmailEventKind;
  bookingId: string | null;
  attempts: number;
  payload: Omit<EmailMessage, "idempotencyKey"> | null;
}

export interface BookingEmailContext {
  bookingId: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  startsAt: Date;
  endsAt: Date;
  totalInCents: number;
  companyId: string;
  companyName: string;
  companySlug: string;
  timezone: string;
  roomName: string;
  companyRecipients: string[];
}

export abstract class EmailOutboxRepository {
  abstract claimDue(now: Date, limit: number): Promise<EmailOutboxEvent[]>;
  abstract loadBookingContext(bookingId: string): Promise<BookingEmailContext | null>;
  abstract markDelivered(
    id: string,
    providerMessageId: string | null,
    deliveredAt: Date,
  ): Promise<void>;
  abstract markSkipped(id: string, reason: string, now: Date): Promise<void>;
  abstract markFailed(input: {
    id: string;
    error: string;
    nextAttemptAt: Date;
    dead: boolean;
    now: Date;
  }): Promise<void>;
  abstract enqueueMessage(input: {
    dedupeKey: string;
    message: Omit<EmailMessage, "idempotencyKey">;
    availableAt?: Date;
  }): Promise<boolean>;
}
