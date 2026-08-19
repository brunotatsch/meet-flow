import { and, eq } from "drizzle-orm";
import { isAppRole } from "@shared/auth/permissions";
import type { Session } from "@shared/schemas/auth.schema";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { findPostgresFailure, UNIQUE_VIOLATION } from "@services/database/postgres-error";
import { HttpError } from "@services/http/http-error";
import { auth } from "../auth/auth";
import { account, invitation, member, user } from "../database/schema/auth";

interface InvitationRegistrationInput {
  name: string;
  password: string;
}

interface InvitedSignUpResult {
  session: Session;
  headers: Headers;
}

/**
 * Cadastro restrito a um convite opaco e ainda utilizável.
 *
 * Usuário, credencial, vínculo e consumo do convite são uma única transação. Isso
 * evita tanto conta sem tenant quanto dois membros criados por cliques concorrentes.
 * O e-mail nunca vem do body: o destinatário é o endereço persistido no convite.
 */
export async function registerInvitedMember(
  invitationId: string,
  input: InvitationRegistrationInput,
  requestHeaders?: Headers,
): Promise<InvitedSignUpResult> {
  const context = await auth.$context;
  const passwordHash = await context.password.hash(input.password);
  const now = new Date();

  const newId = (model: string): string => {
    const id = context.generateId({ model });
    if (id === false) {
      throw new Error(`Geração de id desabilitada para "${model}".`);
    }
    return id;
  };

  let created: Session;

  try {
    created = await db.transaction(async (tx) => {
      const [invite] = await tx
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          organizationId: invitation.organizationId,
          company: {
            id: companies.id,
            name: companies.name,
            slug: companies.slug,
            type: companies.type,
            timezone: companies.timezone,
          },
        })
        .from(invitation)
        .innerJoin(companies, eq(companies.organizationId, invitation.organizationId))
        .where(eq(invitation.id, invitationId))
        .limit(1)
        .for("update");

      if (!invite) {
        throw new HttpError(404, "INVITATION_NOT_FOUND", "Convite não encontrado.");
      }
      if (invite.status !== "pending") {
        throw new HttpError(
          409,
          "INVITATION_ALREADY_USED",
          "Este convite já foi aceito, recusado ou cancelado.",
        );
      }
      if (invite.expiresAt.getTime() <= now.getTime()) {
        throw new HttpError(410, "INVITATION_EXPIRED", "Este convite expirou. Solicite um novo.");
      }
      if (!invite.role || !isAppRole(invite.role)) {
        throw new Error(`Convite ${invite.id} contém papel inválido.`);
      }

      const [existingUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, invite.email))
        .limit(1);

      if (existingUser) {
        throw new HttpError(
          409,
          "ACCOUNT_ALREADY_EXISTS",
          "Já existe uma conta com este e-mail. Entre para aceitar o convite.",
        );
      }

      const userId = newId("user");
      const [createdUser] = await tx
        .insert(user)
        .values({
          id: userId,
          name: input.name,
          email: invite.email,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: user.id, name: user.name, email: user.email });

      await tx.insert(account).values({
        id: newId("account"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(member).values({
        id: newId("member"),
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
        createdAt: now,
      });

      const [consumed] = await tx
        .update(invitation)
        .set({ status: "accepted" })
        .where(and(eq(invitation.id, invite.id), eq(invitation.status, "pending")))
        .returning({ id: invitation.id });

      if (!createdUser || !consumed) {
        throw new HttpError(
          409,
          "INVITATION_ALREADY_USED",
          "Este convite foi consumido por outra requisição.",
        );
      }

      return { user: createdUser, company: invite.company, role: invite.role };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;

    const failure = findPostgresFailure(error);
    if (failure?.sqlState === UNIQUE_VIOLATION) {
      throw new HttpError(
        409,
        "ACCOUNT_ALREADY_EXISTS",
        "Já existe uma conta ou vínculo para este convite.",
      );
    }
    throw error;
  }

  const signedIn = await auth.api.signInEmail({
    body: { email: created.user.email, password: input.password },
    headers: requestHeaders,
    returnHeaders: true,
  });

  return { session: created, headers: signedIn.headers };
}
