import { BookingStatus } from "@shared/enums/booking-status";
import type { Clock } from "@services/bookings/domain/clock";
import { BookingEmailEventKind } from "../domain/booking-email-event";
import type { BookingCancellationToken } from "../domain/cancellation-token";
import type { EmailSender } from "../domain/email-sender";
import { composeBookingEmail } from "./booking-email-template";
import type { EmailOutboxEvent, EmailOutboxRepository } from "./email-outbox.repository";

const MAX_ATTEMPTS = 8;
const MAX_BATCH = 50;

export interface ProcessEmailOutboxResult {
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
  skipped: number;
}

export class ProcessEmailOutboxUseCase {
  constructor(
    private readonly repository: EmailOutboxRepository,
    private readonly sender: EmailSender,
    private readonly token: BookingCancellationToken,
    private readonly clock: Clock,
    private readonly appUrl: string,
  ) {}

  async execute(limit = 20): Promise<ProcessEmailOutboxResult> {
    const now = this.clock.now();
    const events = await this.repository.claimDue(now, clamp(limit, 1, MAX_BATCH));
    const totals: ProcessEmailOutboxResult = {
      claimed: events.length,
      delivered: 0,
      retried: 0,
      dead: 0,
      skipped: 0,
    };

    for (const event of events) {
      const outcome = await this.processOne(event, now);
      totals[outcome] += 1;
    }

    return totals;
  }

  private async processOne(
    event: EmailOutboxEvent,
    now: Date,
  ): Promise<"delivered" | "retried" | "dead" | "skipped"> {
    try {
      const resolved = await this.resolveMessage(event, now);
      if (!resolved) {
        await this.repository.markSkipped(event.id, "evento não se aplica ao estado atual", now);
        return "skipped";
      }

      const delivery = await this.sender.send(resolved);
      await this.repository.markDelivered(event.id, delivery.providerMessageId, now);
      return "delivered";
    } catch (error) {
      const dead = event.attempts >= MAX_ATTEMPTS;
      await this.repository.markFailed({
        id: event.id,
        error: safeError(error),
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(event.attempts)),
        dead,
        now,
      });
      return dead ? "dead" : "retried";
    }
  }

  private async resolveMessage(event: EmailOutboxEvent, now: Date) {
    if (event.payload) {
      return { ...event.payload, idempotencyKey: event.id };
    }

    if (!event.bookingId) return null;
    const context = await this.repository.loadBookingContext(event.bookingId);
    if (!context || !eventMatchesState(event.kind, context.status)) return null;

    return composeBookingEmail({
      eventId: event.id,
      kind: event.kind,
      context,
      appUrl: this.appUrl,
      cancellationToken: this.token,
      now,
    });
  }
}

function eventMatchesState(kind: BookingEmailEventKind, status: BookingStatus): boolean {
  if (kind === BookingEmailEventKind.CANCELLATION) {
    return status === BookingStatus.CANCELLED;
  }

  if (
    kind === BookingEmailEventKind.CONFIRMATION ||
    kind === BookingEmailEventKind.NEW_BOOKING ||
    kind === BookingEmailEventKind.REMINDER
  ) {
    return status === BookingStatus.CONFIRMED;
  }

  return kind === BookingEmailEventKind.GENERIC;
}

function retryDelayMs(attempt: number): number {
  return Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha desconhecida no provedor.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 1_000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
