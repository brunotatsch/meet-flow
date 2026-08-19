import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { isAppRole, type AppRole } from "@shared/auth/permissions";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { HttpError } from "@services/http/http-error";
import { auth } from "../auth/auth";
import { member } from "../database/schema/auth";
import { toWebHeaders } from "./web-headers";

/**
 * Identidade resolvida da requisição.
 *
 * `companyId` daqui é a **única** origem legítima do tenant em qualquer query.
 * Aceitá-lo do body, da query string ou de um header transformaria o isolamento
 * multi-tenant em uma sugestão. Ver `docs/architecture.md`.
 */
export interface RequestAuth {
  userId: string;
  companyId: string;
  organizationId: string;
  /** Papel validado contra a matriz fechada antes de qualquer autorização. */
  role: AppRole;
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Preenchido pelo `preHandler` `requireAuth`. Fica opcional de propósito: em uma
     * rota pública ele é mesmo `undefined`, e prometer o contrário no tipo esconderia
     * o erro até a produção. Use `getRequestAuth` para lê-lo já estreitado.
     */
    auth?: RequestAuth;
  }
}

/**
 * Lê `request.auth` garantindo que o `preHandler` rodou.
 *
 * Se disparar, é bug de composição de rota (handler protegido registrado sem
 * `requireAuth`), não erro do cliente.
 */
export function getRequestAuth(request: FastifyRequest): RequestAuth {
  if (!request.auth) {
    throw new Error("Rota lê request.auth mas não declara o preHandler requireAuth.");
  }

  return request.auth;
}

/**
 * `preHandler` que valida a sessão, resolve a organização ativa e injeta
 * `request.auth`.
 *
 * Interrompe com 401 sem sessão e com 403 quando a sessão existe mas não leva a um
 * tenant (organização ativa sem `company`, ou vínculo removido depois do login). O
 * 403 é deliberado: o usuário está autenticado, só não tem a que empresa pertencer.
 *
 * A interrupção é feita **lançando** `HttpError`, nunca respondendo daqui. O porquê
 * está documentado em `@services/http/http-error`: responder de dentro de um hook
 * não impede o handler de rodar quando o runtime é o Bun.
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  const session = await auth.api.getSession({ headers: toWebHeaders(request) });

  if (!session) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sessão ausente ou expirada.");
  }

  const activeOrganizationId = session.session.activeOrganizationId ?? null;
  const userId = session.user.id;

  /**
   * A organização ativa nasce em `databaseHooks.session.create.before`. O fallback
   * para "o vínculo mais antigo do usuário" cobre sessões emitidas antes de o hook
   * existir e o caso de a coluna ter sido limpa; sem ele um usuário válido ficaria
   * preso em 403. O `orderBy` mantém a escolha estável entre requisições no dia em
   * que um usuário pertencer a mais de uma organização.
   *
   * O filtro por `member.userId` é o que impede escalada: uma sessão com
   * `activeOrganizationId` de um tenant do qual o usuário não é membro não casa com
   * nenhuma linha e cai no 403, em vez de resolver o `companyId` alheio.
   */
  const [membership] = await db
    .select({
      companyId: companies.id,
      organizationId: member.organizationId,
      role: member.role,
    })
    .from(member)
    .innerJoin(companies, eq(companies.organizationId, member.organizationId))
    .where(
      activeOrganizationId
        ? and(eq(member.userId, userId), eq(member.organizationId, activeOrganizationId))
        : eq(member.userId, userId),
    )
    .orderBy(member.createdAt)
    .limit(1);

  if (!membership) {
    throw new HttpError(
      403,
      "NO_ACTIVE_COMPANY",
      "Usuário autenticado não está vinculado a nenhuma empresa ativa.",
    );
  }

  if (!isAppRole(membership.role)) {
    throw new HttpError(
      403,
      "INVALID_MEMBER_ROLE",
      "O papel deste membro não é reconhecido. Contate um owner da equipe.",
    );
  }

  request.auth = {
    userId,
    companyId: membership.companyId,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}
