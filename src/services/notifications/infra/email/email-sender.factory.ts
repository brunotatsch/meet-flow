import type { EmailSender } from "../../domain/email-sender";
import {
  DisabledEmailSender,
  type EmailFetcher,
  ResendEmailSender,
} from "./resend-email-sender";

export function createEmailSender(
  source: NodeJS.ProcessEnv = process.env,
  fetcher: EmailFetcher = fetch,
): EmailSender {
  // Garantia estrutural: mesmo com credenciais presentes, testes nunca criam o
  // adaptador capaz de chamar a internet.
  if (source.NODE_ENV === "test") return new DisabledEmailSender("test");

  const provider = source.EMAIL_PROVIDER ?? "disabled";
  if (provider === "disabled") return new DisabledEmailSender("disabled");
  if (provider !== "resend") {
    throw new Error('EMAIL_PROVIDER deve ser "resend" ou "disabled".');
  }

  return new ResendEmailSender(source.RESEND_API_KEY ?? "", source.EMAIL_FROM ?? "", fetcher);
}
