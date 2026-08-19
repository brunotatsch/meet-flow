import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "@services/audit/infra/database/schema/audit-events";
import { subscriptions } from "@services/billing/infra/database/schema/billing";
import { companies } from "@services/companies/infra/database/schema/companies";
import { buildServer } from "@services/http/server";
import { invitation, member, session, user } from "@services/identity/infra/database/schema/auth";
import { createTestDatabase, type TestDatabase } from "../setup/test-database";

let app: FastifyInstance;
let database: TestDatabase;
let sequence = 0;

interface AccountFixture {
  cookie: string;
  companyId: string;
  organizationId: string;
  userId: string;
  email: string;
}

function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function createAccount(label: string): Promise<AccountFixture> {
  sequence += 1;
  const slug = `team-${label}-${sequence}`;
  const email = `${label}-${sequence}@example.com`;
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sign-up",
    payload: {
      user: { name: `Pessoa ${label}`, email, password: "senha-muito-segura" },
      company: {
        name: `Empresa ${label}`,
        slug,
        type: "hotel",
        timezone: "America/Sao_Paulo",
      },
    },
  });

  expect(response.statusCode).toBe(201);
  const body = response.json();
  const [company] = await database.db
    .select({ organizationId: companies.organizationId })
    .from(companies)
    .where(eq(companies.id, body.company.id))
    .limit(1);

  return {
    cookie: cookieHeader(response),
    companyId: body.company.id,
    organizationId: company!.organizationId,
    userId: body.user.id,
    email,
  };
}

async function moveToTeam(
  account: AccountFixture,
  target: AccountFixture,
  role: "manager" | "staff",
): Promise<void> {
  await database.db
    .update(member)
    .set({ organizationId: target.organizationId, role })
    .where(eq(member.userId, account.userId));
  await database.db
    .update(session)
    .set({ activeOrganizationId: target.organizationId })
    .where(eq(session.userId, account.userId));
}

async function enableStarter(account: AccountFixture): Promise<void> {
  await database.db.insert(subscriptions).values({
    companyId: account.companyId,
    planKey: "starter",
    planVersion: 1,
    status: "active",
    stripeUpdatedAt: new Date(),
  });
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
  database = createTestDatabase();
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe("RBAC aplicado nas rotas reais", () => {
  it("nega criação/exclusão de sala e endpoints Organization diretos para staff", async () => {
    const owner = await createAccount("owner-rbac");
    const staff = await createAccount("staff-rbac");
    await moveToTeam(staff, owner, "staff");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/rooms",
      headers: { cookie: owner.cookie },
      payload: { name: "Sala Protegida", capacity: 8, hourlyRateInCents: 10_000 },
    });
    expect(created.statusCode).toBe(201);

    const [audit] = await database.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.resource, "room"), eq(auditEvents.resourceId, created.json().id)));
    expect(audit).toMatchObject({
      companyId: owner.companyId,
      actorUserId: owner.userId,
      actorType: "user",
      action: "create",
    });

    const [createAsStaff, deleteAsStaff, listMembersDirect, inviteDirect] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/rooms",
        headers: { cookie: staff.cookie },
        payload: { name: "Sala Indevida", capacity: 4, hourlyRateInCents: 1000 },
      }),
      app.inject({
        method: "DELETE",
        url: `/api/v1/rooms/${created.json().id}`,
        headers: { cookie: staff.cookie },
      }),
      app.inject({
        method: "GET",
        url: "/api/auth/organization/list-members",
        headers: { cookie: staff.cookie },
      }),
      app.inject({
        method: "POST",
        url: "/api/auth/organization/invite-member",
        headers: { cookie: staff.cookie },
        payload: { email: "bypass@example.com", role: "staff" },
      }),
    ]);

    for (const response of [createAsStaff, deleteAsStaff, listMembersDirect, inviteDirect]) {
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("FORBIDDEN");
    }
  });

  it("permite manager listar/convidar, mas não alterar papel nem remover membro", async () => {
    const owner = await createAccount("owner-manager");
    const manager = await createAccount("manager");
    await moveToTeam(manager, owner, "manager");
    await enableStarter(owner);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/team",
      headers: { cookie: manager.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().members).toHaveLength(2);

    const invite = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: { cookie: manager.cookie },
      payload: { email: "convidado-manager@example.com", role: "staff" },
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json()).toMatchObject({
      invitation: { email: "convidado-manager@example.com", status: "pending" },
      delivery: { status: "queued" },
    });

    const [managerMember] = await database.db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, manager.userId));

    const [changeRole, remove] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/api/v1/team/members/${managerMember!.id}`,
        headers: { cookie: manager.cookie },
        payload: { role: "staff" },
      }),
      app.inject({
        method: "DELETE",
        url: `/api/v1/team/members/${managerMember!.id}`,
        headers: { cookie: manager.cookie },
      }),
    ]);
    expect(changeRole.statusCode).toBe(403);
    expect(remove.statusCode).toBe(403);
  });
});

describe("proteção do último owner e ciclo do convite", () => {
  it("não permite remover nem rebaixar o último owner", async () => {
    const owner = await createAccount("last-owner");
    const [ownerMember] = await database.db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, owner.userId));

    const downgrade = await app.inject({
      method: "PATCH",
      url: `/api/v1/team/members/${ownerMember!.id}`,
      headers: { cookie: owner.cookie },
      payload: { role: "manager" },
    });
    const remove = await app.inject({
      method: "DELETE",
      url: `/api/v1/team/members/${ownerMember!.id}`,
      headers: { cookie: owner.cookie },
    });

    for (const response of [downgrade, remove]) {
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("LAST_OWNER_REQUIRED");
    }
  });

  it("cadastra o destinatário atomicamente e recusa reutilização do convite", async () => {
    const owner = await createAccount("invite-register");
    await enableStarter(owner);

    const invitedEmail = "novo-membro@example.com";
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: { cookie: owner.cookie },
      payload: { email: invitedEmail, role: "staff" },
    });
    const invitationId = created.json().invitation.id as string;

    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/team/invitations/${invitationId}/register`,
      payload: { name: "Novo Membro", password: "senha-muito-segura" },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({
      user: { email: invitedEmail },
      company: { id: owner.companyId },
      role: "staff",
    });

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: cookieHeader(accepted) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ company: { id: owner.companyId }, role: "staff" });

    const reused = await app.inject({
      method: "POST",
      url: `/api/v1/team/invitations/${invitationId}/register`,
      payload: { name: "Outra Pessoa", password: "senha-muito-segura" },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().code).toBe("INVITATION_ALREADY_USED");
  });

  it("distingue convite expirado e não cria usuário", async () => {
    const owner = await createAccount("invite-expired");
    await enableStarter(owner);

    const expiredEmail = "convite-expirado@example.com";
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: { cookie: owner.cookie },
      payload: { email: expiredEmail, role: "staff" },
    });
    const invitationId = created.json().invitation.id as string;
    await database.db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invitation.id, invitationId));

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/team/invitations/${invitationId}/register`,
      payload: { name: "Não Deve Existir", password: "senha-muito-segura" },
    });
    expect(response.statusCode).toBe(410);
    expect(response.json().code).toBe("INVITATION_EXPIRED");

    const users = await database.db.select().from(user).where(eq(user.email, expiredEmail));
    expect(users).toHaveLength(0);
  });
});
