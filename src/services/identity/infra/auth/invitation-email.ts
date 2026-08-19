import type { EmailMessage } from "@services/notifications/domain/email-sender";

interface InvitationEmailOutbox {
  enqueueMessage(input: {
    dedupeKey: string;
    message: Omit<EmailMessage, "idempotencyKey">;
    availableAt?: Date;
  }): Promise<boolean>;
}

interface InvitationEmailData {
  id: string;
  email: string;
  role: string;
  organization: { name: string };
  inviter: { user: { name: string } };
  invitation: { id: string; expiresAt: Date };
}

/** Callback aguardado pelo plugin Organization; somente enfileira, nunca envia na request. */
export function createInvitationEmailEnqueuer(
  outbox: InvitationEmailOutbox,
  appUrl: string,
): (data: InvitationEmailData) => Promise<void> {
  return async (data) => {
    const acceptUrl = `${appUrl.replace(/\/$/, "")}/admin/convite/${encodeURIComponent(data.id)}`;
    const expiration = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(data.invitation.expiresAt);
    const text = [
      `Olá! ${data.inviter.user.name} convidou você para integrar ${data.organization.name} no MeetFlow como ${data.role}.`,
      `Aceite o convite até ${expiration}: ${acceptUrl}`,
      "Se você não esperava este convite, ignore esta mensagem.",
    ].join("\n\n");

    await outbox.enqueueMessage({
      dedupeKey: `team-invitation:${data.invitation.id}`,
      message: {
        to: [data.email],
        subject: `Convite para ${data.organization.name} — MeetFlow`,
        text,
        html: `<!doctype html><html lang="pt-BR"><body>${text
          .split("\n\n")
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join(
            "",
          )}<p><a href="${escapeHtml(acceptUrl)}">Aceitar convite</a></p><p>Equipe MeetFlow</p></body></html>`,
      },
    });
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
