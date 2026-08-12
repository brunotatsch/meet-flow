import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Response as InjectResponse } from "light-my-request";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies } from "@services/companies/infra/database/schema/companies";
import { buildServer } from "@services/http/server";
import { member, organization, user } from "@services/identity/infra/database/schema/auth";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { createTestDatabase, type TestDatabase } from "../setup/test-database";

let app: FastifyInstance;
let database: TestDatabase;

/**
 * Prova que `requireAuth` de fato aborta a requisição, e não apenas responde 401
 * enquanto deixa o handler rodar em seguida. Ver `@services/http/http-error`.
 */
let probeHandlerRan = false;

function signUpPayload(overrides: { email?: string; slug?: string; name?: string } = {}) {
  return {
    user: {
      name: "Bruno Tatsch",
      email: overrides.email ?? "bruno@exemplo.com",
      password: "senha-muito-segura",
    },
    company: {
      name: overrides.name ?? "Hotel Aurora",
      slug: overrides.slug ?? "auth-hotel-aurora",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    },
  };
}

/** Reduz o `Set-Cookie` da resposta ao formato aceito no header `Cookie`. */
function cookieHeader(response: InjectResponse): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signUp(overrides: Parameters<typeof signUpPayload>[0] = {}) {
  return app.inject({ method: "POST", url: "/api/v1/sign-up", payload: signUpPayload(overrides) });
}

beforeAll(async () => {
  app = buildServer();
  app.get("/sonda-protegida", { preHandler: requireAuth }, async () => {
    probeHandlerRan = true;
    return { ok: true };
  });
  await app.ready();
  database = createTestDatabase();
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe("POST /api/v1/sign-up", () => {
  it("cria usuário, organização e company na mesma transação e devolve a sessão", async () => {
    const response = await signUp({ email: "ana@exemplo.com", slug: "auth-hotel-atlantico" });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ name: "Bruno Tatsch", email: "ana@exemplo.com" });
    expect(body.company).toMatchObject({
      slug: "auth-hotel-atlantico",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    });
    expect(body.role).toBe("owner");

    const [company] = await database.db
      .select()
      .from(companies)
      .where(eq(companies.slug, "auth-hotel-atlantico"));
    expect(company?.id).toBe(body.company.id);

    const [tenant] = await database.db
      .select()
      .from(organization)
      .where(eq(organization.id, company!.organizationId));
    expect(tenant?.slug).toBe("auth-hotel-atlantico");

    const [membership] = await database.db
      .select()
      .from(member)
      .where(eq(member.organizationId, company!.organizationId));
    expect(membership?.role).toBe("owner");
    expect(membership?.userId).toBe(body.user.id);
  });

  it("já devolve uma sessão utilizável, sem exigir login logo depois do cadastro", async () => {
    const response = await signUp({ email: "carla@exemplo.com", slug: "auth-coworking-sul" });

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: cookieHeader(response) },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().company.slug).toBe("auth-coworking-sul");
  });

  it("normaliza slug e e-mail antes de gravar", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sign-up",
      payload: {
        user: { name: "Davi Ramos", email: "  Davi@Exemplo.COM  ", password: "senha-muito-segura" },
        company: {
          name: "Hotel Boreal",
          slug: "  Auth-Hotel-Boreal  ",
          type: "hotel",
          timezone: "America/Sao_Paulo",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.email).toBe("davi@exemplo.com");
    expect(response.json().company.slug).toBe("auth-hotel-boreal");
  });

  it("rejeita payload inválido com 400 antes de tocar no banco", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sign-up",
      payload: {
        ...signUpPayload({ email: "eva@exemplo.com" }),
        company: { ...signUpPayload().company, slug: "Hotel Central" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");

    const users = await database.db.select().from(user).where(eq(user.email, "eva@exemplo.com"));
    expect(users).toHaveLength(0);
  });
});

describe("conflitos de cadastro", () => {
  it("devolve 409 em slug já usado e não deixa usuário órfão", async () => {
    await signUp({ email: "primeiro@exemplo.com", slug: "auth-hotel-repetido" });

    const response = await signUp({ email: "segundo@exemplo.com", slug: "auth-hotel-repetido" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SLUG_ALREADY_TAKEN");

    const orphans = await database.db
      .select()
      .from(user)
      .where(eq(user.email, "segundo@exemplo.com"));
    expect(orphans).toHaveLength(0);
  });

  it("devolve 409 em e-mail já cadastrado e não cria a segunda empresa", async () => {
    await signUp({ email: "repetido@exemplo.com", slug: "auth-hotel-primeiro" });

    const response = await signUp({ email: "repetido@exemplo.com", slug: "auth-hotel-segundo" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("EMAIL_ALREADY_REGISTERED");

    const created = await database.db
      .select()
      .from(companies)
      .where(eq(companies.slug, "auth-hotel-segundo"));
    expect(created).toHaveLength(0);
  });
});

describe("login e GET /api/v1/me", () => {
  it("faz login pelo handler do Better Auth e resolve o companyId correto", async () => {
    const created = await signUp({ email: "felipe@exemplo.com", slug: "auth-hotel-fenix" });
    const companyId = created.json().company.id;

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: "felipe@exemplo.com", password: "senha-muito-segura" },
    });

    expect(signIn.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: cookieHeader(signIn) },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      user: { id: expect.any(String), name: "Bruno Tatsch", email: "felipe@exemplo.com" },
      company: {
        id: companyId,
        name: "Hotel Aurora",
        slug: "auth-hotel-fenix",
        type: "hotel",
        timezone: "America/Sao_Paulo",
      },
      role: "owner",
    });
  });

  it("aceita login com o e-mail digitado em maiúsculas", async () => {
    await signUp({ email: "gabi@exemplo.com", slug: "auth-hotel-gaivota" });

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: "GABI@Exemplo.com", password: "senha-muito-segura" },
    });

    expect(signIn.statusCode).toBe(200);
  });

  it("responde 401 sem sessão", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHENTICATED");
  });

  it("aborta a requisição no preHandler, sem executar o handler protegido", async () => {
    const response = await app.inject({ method: "GET", url: "/sonda-protegida" });

    expect(response.statusCode).toBe(401);
    expect(probeHandlerRan).toBe(false);
  });

  it("deixa a rota protegida rodar quando a sessão é válida", async () => {
    const created = await signUp({ email: "lia@exemplo.com", slug: "auth-hotel-lumiar" });

    const response = await app.inject({
      method: "GET",
      url: "/sonda-protegida",
      headers: { cookie: cookieHeader(created) },
    });

    expect(response.statusCode).toBe(200);
    expect(probeHandlerRan).toBe(true);
  });

  /**
   * Sessão válida cujo tenant sumiu. O 403 separa "não sei quem você é" de "sei quem
   * você é, mas não a que empresa você pertence": tratar o segundo como 401 mandaria
   * o usuário para a tela de login em um loop que nenhum login resolve.
   */
  it("responde 403 quando a sessão é válida mas a empresa não existe mais", async () => {
    const created = await signUp({ email: "marta@exemplo.com", slug: "auth-hotel-miragem" });
    const cookie = cookieHeader(created);

    await database.db.delete(companies).where(eq(companies.slug, "auth-hotel-miragem"));

    const response = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("NO_ACTIVE_COMPANY");
  });

  it("responde 401 com cookie de sessão forjado", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: "better-auth.session_token=token-inventado" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("dá a cada tenant o seu próprio companyId", async () => {
    const first = await signUp({ email: "helena@exemplo.com", slug: "auth-hotel-horizonte" });
    const second = await signUp({ email: "igor@exemplo.com", slug: "auth-coworking-ilha" });

    const [firstMe, secondMe] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { cookie: cookieHeader(first) },
      }),
      app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { cookie: cookieHeader(second) },
      }),
    ]);

    expect(firstMe.json().company.slug).toBe("auth-hotel-horizonte");
    expect(secondMe.json().company.slug).toBe("auth-coworking-ilha");
    expect(firstMe.json().company.id).not.toBe(secondMe.json().company.id);
  });
});

/**
 * O cadastro e a criação de organização precisam ter um caminho só. Se estes dois
 * endpoints voltarem a responder, passa a ser possível criar usuário sem empresa
 * (ou empresa sem perfil), e `requireAuth` deixa de conseguir resolver o tenant.
 */
describe("caminhos alternativos desligados", () => {
  it("recusa o cadastro embutido do Better Auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { name: "Jonas Melo", email: "jonas@exemplo.com", password: "senha-muito-segura" },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);

    const users = await database.db.select().from(user).where(eq(user.email, "jonas@exemplo.com"));
    expect(users).toHaveLength(0);
  });

  it("recusa a criação avulsa de organização", async () => {
    const created = await signUp({ email: "kelly@exemplo.com", slug: "auth-hotel-kalahari" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/organization/create",
      headers: { cookie: cookieHeader(created) },
      payload: { name: "Empresa Fantasma", slug: "empresa-fantasma" },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);

    const orphans = await database.db
      .select()
      .from(organization)
      .where(eq(organization.slug, "empresa-fantasma"));
    expect(orphans).toHaveLength(0);
  });
});
