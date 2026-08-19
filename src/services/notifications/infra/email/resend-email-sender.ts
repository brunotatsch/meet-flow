import type { EmailDelivery, EmailMessage, EmailSender } from "../../domain/email-sender";

export type EmailFetcher = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: EmailFetcher = fetch,
  ) {
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");
    if (!from) throw new Error("EMAIL_FROM não configurado.");
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend recusou o envio (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length === 0) {
      throw new Error("Resend respondeu sem id de entrega.");
    }

    return { providerMessageId: body.id };
  }
}

/** Nunca toca a rede; usado em testes e quando o provedor está desabilitado. */
export class DisabledEmailSender implements EmailSender {
  constructor(private readonly reason: "test" | "disabled") {}

  async send(_message: EmailMessage): Promise<EmailDelivery> {
    return { providerMessageId: `disabled:${this.reason}` };
  }
}
