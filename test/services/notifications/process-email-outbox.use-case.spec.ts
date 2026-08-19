import { describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import type { EmailMessage, EmailSender } from "@services/notifications/domain/email-sender";
import { BookingEmailEventKind } from "@services/notifications/domain/booking-email-event";
import { BookingCancellationToken } from "@services/notifications/domain/cancellation-token";
import {
  EmailOutboxRepository,
  type BookingEmailContext,
  type EmailOutboxEvent,
} from "@services/notifications/application/email-outbox.repository";
import { ProcessEmailOutboxUseCase } from "@services/notifications/application/process-email-outbox.use-case";
import { createEmailSender } from "@services/notifications/infra/email/email-sender.factory";
import { FixedClock } from "../bookings/fixed-clock";

const NOW = new Date("2030-06-01T12:00:00.000Z");
const SECRET = "cancelamento-seguro-para-testes-0123456789";

class MemoryOutbox extends EmailOutboxRepository {
  attempts = 0;
  nextAttemptAt = NOW;
  delivered = false;
  dead = false;
  skipped = false;
  lastError: string | null = null;

  private readonly event: EmailOutboxEvent = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: BookingEmailEventKind.CONFIRMATION,
    bookingId: "22222222-2222-4222-8222-222222222222",
    attempts: 0,
    payload: null,
  };

  async claimDue(now: Date): Promise<EmailOutboxEvent[]> {
    if (this.delivered || this.dead || now < this.nextAttemptAt) return [];
    this.attempts += 1;
    return [{ ...this.event, attempts: this.attempts }];
  }

  async loadBookingContext(): Promise<BookingEmailContext> {
    return {
      bookingId: this.event.bookingId!,
      status: BookingStatus.CONFIRMED,
      customerName: "Ana Prado",
      customerEmail: "ana@exemplo.com",
      startsAt: new Date("2030-06-03T12:00:00.000Z"),
      endsAt: new Date("2030-06-03T13:00:00.000Z"),
      totalInCents: 15_000,
      companyId: "33333333-3333-4333-8333-333333333333",
      companyName: "Coworking Centro",
      companySlug: "coworking-centro",
      timezone: "America/Sao_Paulo",
      roomName: "Sala Ipê",
      companyRecipients: ["gestao@exemplo.com"],
    };
  }

  async markDelivered(): Promise<void> {
    this.delivered = true;
  }

  async markSkipped(): Promise<void> {
    this.skipped = true;
  }

  async markFailed(input: { error: string; nextAttemptAt: Date; dead: boolean }): Promise<void> {
    this.lastError = input.error;
    this.nextAttemptAt = input.nextAttemptAt;
    this.dead = input.dead;
  }

  async enqueueMessage(): Promise<boolean> {
    return true;
  }
}

class FlakySender implements EmailSender {
  calls = 0;
  messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.calls += 1;
    this.messages.push(message);
    if (this.calls === 1) throw new Error("provedor temporariamente indisponível");
    return { providerMessageId: "email_123" };
  }
}

describe("ProcessEmailOutboxUseCase", () => {
  it("registra falha, aplica backoff e reprocessa sem perder o evento", async () => {
    const repository = new MemoryOutbox();
    const sender = new FlakySender();
    const clock = new FixedClock(NOW);
    const useCase = new ProcessEmailOutboxUseCase(
      repository,
      sender,
      new BookingCancellationToken(SECRET),
      clock,
      "https://meetflow.example",
    );

    await expect(useCase.execute()).resolves.toMatchObject({ retried: 1, delivered: 0 });
    expect(repository.lastError).toContain("temporariamente");
    expect(repository.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());

    clock.set(repository.nextAttemptAt);
    await expect(useCase.execute()).resolves.toMatchObject({ retried: 0, delivered: 1 });
    expect(repository.delivered).toBe(true);
    expect(sender.messages[0]?.text).toContain("Sua reserva");
    expect(sender.messages[0]?.text).not.toContain("telefone");
  });

  it("ambiente de teste nunca instancia um sender que toca a rede", async () => {
    let networkCalls = 0;
    const sender = createEmailSender(
      {
        NODE_ENV: "test",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_credencial_que_nao_deve_ser_usada",
        EMAIL_FROM: "MeetFlow <reservas@example.com>",
      },
      async () => {
        networkCalls += 1;
        return new Response(JSON.stringify({ id: "unexpected" }), { status: 200 });
      },
    );

    await sender.send({
      to: ["ana@exemplo.com"],
      subject: "Teste",
      text: "Teste",
      html: "<p>Teste</p>",
      idempotencyKey: "test",
    });
    expect(networkCalls).toBe(0);
  });
});
