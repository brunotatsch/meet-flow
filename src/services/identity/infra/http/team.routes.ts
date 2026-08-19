import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppRole, PermissionAction, PermissionResource, isAppRole } from "@shared/auth/permissions";
import {
  InvitationRegistrationSchema,
  InviteTeamMemberSchema,
  UpdateTeamMemberRoleSchema,
  type TeamInvitation,
} from "@shared/schemas/team.schema";
import { PlanAccessService } from "@services/billing/application/plan-access.service";
import { DrizzleSubscriptionRepository } from "@services/billing/infra/database/drizzle-subscription.repository";
import { DrizzleUsageRepository } from "@services/billing/infra/database/drizzle-usage.repository";
import { createPlanLimitPreHandler } from "@services/billing/infra/http/plan-limit";
import { PlanLimitExceededError } from "@services/billing/domain/errors";
import { planLimitHttpError } from "@services/billing/infra/http/billing-error";
import { env } from "@services/config/env";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { HttpError } from "@services/http/http-error";
import { auth } from "../auth/auth";
import { invitation, member, organization, user } from "../database/schema/auth";
import { registerInvitedMember } from "./invited-sign-up";
import { getRequestAuth, requireAuth } from "./require-auth";
import { requirePermission } from "./require-permission";
import { applyWebHeaders, toWebHeaders } from "./web-headers";

const INVITATION_DELIVERY_MESSAGE =
  "O convite foi enfileirado para envio. Você também pode copiar o link de aceite.";

interface MemberParams {
  Params: { memberId: string };
}

interface InvitationParams {
  Params: { invitationId: string };
}

type InvitationRow = typeof invitation.$inferSelect & {
  organizationName: string;
  companyId: string;
};

export async function registerTeamRoutes(app: FastifyInstance): Promise<void> {
  const planAccess = new PlanAccessService(
    new DrizzleSubscriptionRepository(),
    new DrizzleUsageRepository(),
  );

  app.get(
    "/team",
    {
      preHandler: [requireAuth, requirePermission(PermissionAction.READ, PermissionResource.TEAM)],
    },
    async (request, reply) => {
      const { organizationId } = getRequestAuth(request);
      const [members, invitations] = await Promise.all([
        db
          .select({
            id: member.id,
            userId: member.userId,
            name: user.name,
            email: user.email,
            role: member.role,
            createdAt: member.createdAt,
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(eq(member.organizationId, organizationId))
          .orderBy(asc(member.createdAt)),
        db
          .select()
          .from(invitation)
          .where(
            and(eq(invitation.organizationId, organizationId), eq(invitation.status, "pending")),
          )
          .orderBy(asc(invitation.createdAt)),
      ]);

      return reply.send({
        members: members.map((entry) => ({
          ...entry,
          role: requireAppRole(entry.role),
          createdAt: entry.createdAt.toISOString(),
        })),
        invitations: invitations.map(toTeamInvitation),
      });
    },
  );

  app.post(
    "/team/invitations",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.INVITE, PermissionResource.TEAM),
        createPlanLimitPreHandler(planAccess, "users", "authenticated"),
      ],
    },
    async (request, reply) => {
      const parsed = InviteTeamMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Dados do convite inválidos.",
          parsed.error.issues,
        );
      }

      const { organizationId } = getRequestAuth(request);

      try {
        const created = await auth.api.createInvitation({
          headers: toWebHeaders(request),
          body: { ...parsed.data, organizationId },
        });

        return reply.code(201).send({
          invitation: toTeamInvitation(created),
          delivery: { status: "queued", message: INVITATION_DELIVERY_MESSAGE },
        });
      } catch (error) {
        throw mapOrganizationError(error);
      }
    },
  );

  app.delete<InvitationParams>(
    "/team/invitations/:invitationId",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.INVITE, PermissionResource.TEAM),
      ],
    },
    async (request, reply) => {
      const authContext = getRequestAuth(request);
      await requireInvitationForOrganization(
        request.params.invitationId,
        authContext.organizationId,
      );

      try {
        await auth.api.cancelInvitation({
          headers: toWebHeaders(request),
          body: { invitationId: request.params.invitationId },
        });
        return reply.send({ success: true });
      } catch (error) {
        throw mapOrganizationError(error);
      }
    },
  );

  app.patch<MemberParams>(
    "/team/members/:memberId",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.UPDATE, PermissionResource.TEAM),
      ],
    },
    async (request, reply) => {
      const parsed = UpdateTeamMemberRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, "VALIDATION_ERROR", "Papel inválido.", parsed.error.issues);
      }

      const authContext = getRequestAuth(request);
      await assertOwnerCanBeChanged(
        request.params.memberId,
        authContext.organizationId,
        parsed.data.role,
      );

      try {
        await auth.api.updateMemberRole({
          headers: toWebHeaders(request),
          body: {
            memberId: request.params.memberId,
            role: parsed.data.role,
            organizationId: authContext.organizationId,
          },
        });
        return reply.send({ success: true });
      } catch (error) {
        throw mapOrganizationError(error);
      }
    },
  );

  app.delete<MemberParams>(
    "/team/members/:memberId",
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionAction.DELETE, PermissionResource.TEAM),
      ],
    },
    async (request, reply) => {
      const { organizationId } = getRequestAuth(request);
      await assertOwnerCanBeChanged(request.params.memberId, organizationId, null);

      try {
        await auth.api.removeMember({
          headers: toWebHeaders(request),
          body: { memberIdOrEmail: request.params.memberId, organizationId },
        });
        return reply.send({ success: true });
      } catch (error) {
        throw mapOrganizationError(error);
      }
    },
  );

  app.get<InvitationParams>("/team/invitations/:invitationId", async (request, reply) => {
    const row = await findInvitation(request.params.invitationId);
    if (!row) throw invitationNotFound();

    const status = invitationStatus(row);
    return reply.send({
      id: row.id,
      email: row.email,
      role: requireAppRole(row.role),
      status,
      expiresAt: row.expiresAt.toISOString(),
      organizationName: row.organizationName,
      actionable: status === "pending",
    });
  });

  app.post<InvitationParams>(
    "/team/invitations/:invitationId/accept",
    { preHandler: requireAuth },
    async (request, reply) => acceptInvitation(request, reply, planAccess),
  );

  app.post<InvitationParams>("/team/invitations/:invitationId/register", async (request, reply) => {
    const parsed = InvitationRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Dados de acesso inválidos.",
        parsed.error.issues,
      );
    }

    const invitationRow = await findInvitation(request.params.invitationId);
    assertInvitationActionable(invitationRow);
    await assertUserCapacity(planAccess, invitationRow.companyId);

    const result = await registerInvitedMember(
      request.params.invitationId,
      parsed.data,
      toWebHeaders(request),
    );
    applyWebHeaders(reply, result.headers);
    return reply.code(201).send(result.session);
  });
}

async function acceptInvitation(
  request: FastifyRequest<InvitationParams>,
  reply: FastifyReply,
  planAccess: PlanAccessService,
): Promise<FastifyReply> {
  const row = await findInvitation(request.params.invitationId);
  assertInvitationActionable(row);
  await assertUserCapacity(planAccess, row.companyId);

  const requestAuth = getRequestAuth(request);
  const [recipient] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, requestAuth.userId))
    .limit(1);

  if (!recipient || recipient.email.toLowerCase() !== row.email.toLowerCase()) {
    throw new HttpError(
      403,
      "INVITATION_RECIPIENT_MISMATCH",
      "Este convite pertence a outro endereço de e-mail.",
    );
  }

  try {
    const result = await auth.api.acceptInvitation({
      headers: toWebHeaders(request),
      body: { invitationId: row.id },
      returnHeaders: true,
    });
    applyWebHeaders(reply, result.headers);
    return reply.send({ success: true });
  } catch (error) {
    throw mapOrganizationError(error);
  }
}

async function findInvitation(id: string): Promise<InvitationRow | null> {
  const [row] = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterId: invitation.inviterId,
      organizationName: organization.name,
      companyId: companies.id,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(companies, eq(companies.organizationId, invitation.organizationId))
    .where(eq(invitation.id, id))
    .limit(1);

  return row ?? null;
}

async function requireInvitationForOrganization(id: string, organizationId: string) {
  const row = await findInvitation(id);
  if (!row || row.organizationId !== organizationId) throw invitationNotFound();
  return row;
}

function assertInvitationActionable(row: InvitationRow | null): asserts row is InvitationRow {
  if (!row) throw invitationNotFound();

  if (row.status !== "pending") {
    throw new HttpError(
      409,
      "INVITATION_ALREADY_USED",
      "Este convite já foi aceito, recusado ou cancelado.",
    );
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(410, "INVITATION_EXPIRED", "Este convite expirou. Solicite um novo.");
  }
}

async function assertUserCapacity(access: PlanAccessService, companyId: string): Promise<void> {
  try {
    await access.assertCanCreate(companyId, "users");
  } catch (error) {
    if (error instanceof PlanLimitExceededError) throw planLimitHttpError(error);
    throw error;
  }
}

async function assertOwnerCanBeChanged(
  memberId: string,
  organizationId: string,
  nextRole: AppRole | null,
): Promise<void> {
  const [target] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
    .limit(1);

  if (!target) {
    throw new HttpError(404, "MEMBER_NOT_FOUND", "Membro não encontrado.");
  }

  if (target.role !== AppRole.OWNER || nextRole === AppRole.OWNER) return;

  const owners = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, AppRole.OWNER)));

  if (owners.length <= 1) {
    throw new HttpError(409, "LAST_OWNER_REQUIRED", "A equipe precisa manter pelo menos um owner.");
  }
}

function toTeamInvitation(row: typeof invitation.$inferSelect): TeamInvitation {
  return {
    id: row.id,
    email: row.email,
    role: requireAppRole(row.role),
    status: invitationStatus(row),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptUrl: `${env.APP_URL}/admin/convite/${encodeURIComponent(row.id)}`,
  };
}

function invitationStatus(row: Pick<typeof invitation.$inferSelect, "status" | "expiresAt">) {
  if (row.status === "pending" && row.expiresAt.getTime() <= Date.now()) return "expired" as const;
  if (
    row.status === "pending" ||
    row.status === "accepted" ||
    row.status === "rejected" ||
    row.status === "canceled"
  ) {
    return row.status;
  }
  throw new Error(`Status de convite desconhecido: ${row.status}`);
}

function requireAppRole(role: string | null): AppRole {
  if (!role || !isAppRole(role)) throw new Error(`Papel de organização inválido: ${role}`);
  return role;
}

function invitationNotFound() {
  return new HttpError(404, "INVITATION_NOT_FOUND", "Convite não encontrado.");
}

function mapOrganizationError(error: unknown): unknown {
  if (error instanceof HttpError) return error;

  const value = error as {
    statusCode?: number;
    body?: { code?: string; message?: string };
    message?: string;
  };
  const code = value.body?.code;
  const messages: Record<string, string> = {
    USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "Este usuário já faz parte da equipe.",
    USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "Já existe um convite pendente para este e-mail.",
    YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: "Seu papel não permite convidar um owner.",
    MEMBER_NOT_FOUND: "Membro não encontrado.",
    INVITATION_NOT_FOUND: "Convite não encontrado ou já consumido.",
    YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
      "A equipe precisa manter pelo menos um owner.",
    YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
      "A equipe precisa manter pelo menos um owner.",
  };

  if (code) {
    return new HttpError(
      value.statusCode ?? 400,
      code,
      messages[code] ?? value.body?.message ?? "Não foi possível alterar a equipe.",
    );
  }

  return error;
}
