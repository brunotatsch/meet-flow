import { BookingEmailEventKind } from "../domain/booking-email-event";
import type { BookingCancellationToken } from "../domain/cancellation-token";
import type { EmailMessage } from "../domain/email-sender";
import type { BookingEmailContext } from "./email-outbox.repository";

export function composeBookingEmail(input: {
  eventId: string;
  kind: BookingEmailEventKind;
  context: BookingEmailContext;
  appUrl: string;
  cancellationToken: BookingCancellationToken;
  now: Date;
}): EmailMessage | null {
  const { context } = input;
  const interval = formatInterval(context.startsAt, context.endsAt, context.timezone);
  const total = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(context.totalInCents / 100);
  const cancelUrl =
    context.startsAt.getTime() > input.now.getTime()
      ? `${input.appUrl.replace(/\/$/, "")}/cancelar-reserva#token=${encodeURIComponent(
          input.cancellationToken.issue({
            bookingId: context.bookingId,
            companyId: context.companyId,
            expiresAt: context.startsAt,
          }),
        )}`
      : null;

  if (input.kind === BookingEmailEventKind.CONFIRMATION) {
    const cancelText = cancelUrl
      ? `\nSe precisar, cancele com segurança antes do início: ${cancelUrl}`
      : "";
    return message(
      [context.customerEmail],
      `Reserva confirmada — ${context.companyName}`,
      `Olá, ${context.customerName}. Sua reserva da sala ${context.roomName} está confirmada para ${interval}. Total: ${total}.${cancelText}`,
      cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Cancelar minha reserva</a></p>` : "",
      input.eventId,
    );
  }

  if (input.kind === BookingEmailEventKind.NEW_BOOKING) {
    if (context.companyRecipients.length === 0) return null;
    return message(
      context.companyRecipients,
      `Nova reserva confirmada — ${context.roomName}`,
      `Uma nova reserva foi confirmada para ${context.roomName}, em ${interval}. Cliente: ${context.customerName} (${context.customerEmail}). Total: ${total}.`,
      "",
      input.eventId,
    );
  }

  if (input.kind === BookingEmailEventKind.CANCELLATION) {
    return message(
      [context.customerEmail],
      `Reserva cancelada — ${context.companyName}`,
      `Olá, ${context.customerName}. A reserva da sala ${context.roomName}, antes marcada para ${interval}, foi cancelada. Nenhuma outra informação da sua conta foi alterada.`,
      "",
      input.eventId,
    );
  }

  if (input.kind === BookingEmailEventKind.REMINDER) {
    const cancelText = cancelUrl ? `\nPara cancelar antes do início: ${cancelUrl}` : "";
    return message(
      [context.customerEmail],
      `Lembrete de reserva — ${context.companyName}`,
      `Olá, ${context.customerName}. Lembramos que sua reserva da sala ${context.roomName} começa em ${interval}.${cancelText}`,
      cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Cancelar minha reserva</a></p>` : "",
      input.eventId,
    );
  }

  return null;
}

function message(
  to: readonly string[],
  subject: string,
  text: string,
  extraHtml: string,
  idempotencyKey: string,
): EmailMessage {
  const paragraphs = text
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return {
    to,
    subject,
    text,
    html: `<!doctype html><html lang="pt-BR"><body>${paragraphs}${extraHtml}<p>Equipe MeetFlow</p></body></html>`,
    idempotencyKey,
  };
}

function formatInterval(startsAt: Date, endsAt: Date, timezone: string): string {
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: timezone,
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `${date}, das ${time.format(startsAt)} às ${time.format(endsAt)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
