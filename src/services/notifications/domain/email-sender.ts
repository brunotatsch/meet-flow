export interface EmailMessage {
  to: readonly string[];
  subject: string;
  html: string;
  text: string;
  /** Chave estável usada pelo provedor para deduplicar retentativas. */
  idempotencyKey: string;
}

export interface EmailDelivery {
  providerMessageId: string | null;
}

/**
 * Porta do domínio. A aplicação nunca conhece Resend, SMTP ou `fetch` e o
 * ambiente de teste pode usar uma implementação estritamente local.
 */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<EmailDelivery>;
}
