import { describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { composeBookingEmail } from "@services/notifications/application/booking-email-template";
import { BookingEmailEventKind } from "@services/notifications/domain/booking-email-event";
import { BookingCancellationToken } from "@services/notifications/domain/cancellation-token";

const context = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  status: BookingStatus.CONFIRMED,
  customerName: "Ana & Prado",
  customerEmail: "ana@exemplo.com",
  startsAt: new Date("2030-06-03T12:00:00.000Z"),
  endsAt: new Date("2030-06-03T13:00:00.000Z"),
  totalInCents: 15_000,
  companyId: "22222222-2222-4222-8222-222222222222",
  companyName: "Coworking Centro",
  companySlug: "coworking-centro",
  timezone: "America/Sao_Paulo",
  roomName: "Sala Ipê",
  companyRecipients: ["gestao@exemplo.com"],
};

describe("templates de reserva", () => {
  it.each([
    BookingEmailEventKind.CONFIRMATION,
    BookingEmailEventKind.NEW_BOOKING,
    BookingEmailEventKind.CANCELLATION,
    BookingEmailEventKind.REMINDER,
  ])("renderiza %s em português e sem PII desnecessária", (kind) => {
    const email = composeBookingEmail({
      eventId: "33333333-3333-4333-8333-333333333333",
      kind,
      context,
      appUrl: "https://meetflow.example",
      cancellationToken: new BookingCancellationToken("cancelamento-seguro-para-testes-0123456789"),
      now: new Date("2030-06-01T12:00:00.000Z"),
    });

    expect(email?.subject).toMatch(/Reserva|reserva|Lembrete/);
    expect(email?.text).toContain("Sala Ipê");
    expect(email?.text).not.toMatch(/telefone|observaç|senha/i);
    expect(email?.html).not.toContain("Ana & Prado");
    expect(email?.html).toContain("Ana &amp; Prado");
  });
});
