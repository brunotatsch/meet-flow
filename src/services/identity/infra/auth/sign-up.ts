import type { SignUpInput } from "@shared/schemas/company.schema";
import type { Session } from "@shared/schemas/auth.schema";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { findPostgresFailure, UNIQUE_VIOLATION } from "@services/database/postgres-error";
import { account, member, organization, user } from "../database/schema/auth";
import { auth } from "./auth";

export type SignUpConflictCode = "EMAIL_ALREADY_REGISTERED" | "SLUG_ALREADY_TAKEN";

export class SignUpConflictError extends Error {
  constructor(
    readonly code: SignUpConflictCode,
    message: string,
  ) {
    super(message);
    this.name = "SignUpConflictError";
  }
}

export interface SignUpResult {
  session: Session;
  /** Cabeçalhos do Better Auth com o `Set-Cookie` da sessão recém-criada. */
  headers: Headers;
}

/**
 * Mapeia a constraint violada para o conflito de negócio correspondente.
 *
 * A ordem dos inserts na transação decide qual dispara primeiro: e-mail antes de
 * slug. `companies_organization_id_unique` fica de fora de propósito: a organização
 * é criada na mesma transação, então colidir ali seria bug, não conflito de entrada.
 */
const CONFLICT_BY_CONSTRAINT: Record<string, SignUpConflictCode> = {
  user_email_unique: "EMAIL_ALREADY_REGISTERED",
  organization_slug_unique: "SLUG_ALREADY_TAKEN",
  organization_slug_uidx: "SLUG_ALREADY_TAKEN",
  companies_slug_unique: "SLUG_ALREADY_TAKEN",
};

const CONFLICT_MESSAGE: Record<SignUpConflictCode, string> = {
  EMAIL_ALREADY_REGISTERED: "Já existe uma conta com este e-mail.",
  SLUG_ALREADY_TAKEN: "Este slug já está em uso por outra empresa.",
};

/**
 * Cria usuário, credencial, organização, vínculo `owner` e `company` em **uma única
 * transação**, e só então abre a sessão.
 *
 * As cinco linhas são escritas direto pelo Drizzle em vez de por `auth.api.signUpEmail`
 * + `auth.api.createOrganization`. O motivo é o critério de aceite "slug já existente
 * retorna 409 e não deixa usuário órfão": encadear chamadas do Better Auth criaria o
 * usuário em uma transação e a organização em outra, e um slug duplicado (ou uma queda
 * de processo no meio) deixaria para trás um usuário sem tenant. Compensar isso por
 * código é um saga que também pode falhar; o `ROLLBACK` do Postgres não pode.
 *
 * O preço é acoplamento ao schema do Better Auth. Ele é contido porque as tabelas são
 * geradas pelo CLI e versionadas neste repositório, e porque o login logo abaixo
 * exercita a escrita: se `account.password` fosse gravado errado, o cadastro falharia
 * no ato em vez de silenciosamente.
 *
 * O que continua sendo do Better Auth: o hash da senha (`context.password.hash`), a
 * geração de ids e a emissão da sessão (`auth.api.signInEmail`). Nada disso é
 * reimplementado aqui.
 */
export async function signUp(input: SignUpInput, requestHeaders?: Headers): Promise<SignUpResult> {
  const context = await auth.$context;
  const passwordHash = await context.password.hash(input.user.password);
  const now = new Date();

  const newId = (model: string): string => {
    const id = context.generateId({ model });

    if (id === false) {
      throw new Error(
        `Geração de id desabilitada para "${model}", mas o schema não tem default para a coluna.`,
      );
    }

    return id;
  };

  const created = await runSignUpTransaction(input, passwordHash, now, newId);

  const { headers } = await auth.api.signInEmail({
    body: { email: input.user.email, password: input.user.password },
    headers: requestHeaders,
    returnHeaders: true,
  });

  return { session: created, headers };
}

async function runSignUpTransaction(
  input: SignUpInput,
  passwordHash: string,
  now: Date,
  newId: (model: string) => string,
): Promise<Session> {
  try {
    return await db.transaction(async (tx) => {
      const userId = newId("user");
      const organizationId = newId("organization");

      const [createdUser] = await tx
        .insert(user)
        .values({
          id: userId,
          name: input.user.name,
          email: input.user.email,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: user.id, name: user.name, email: user.email });

      await tx.insert(account).values({
        id: newId("account"),
        /** Para credencial local o Better Auth usa o próprio id do usuário como `accountId`. */
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(organization).values({
        id: organizationId,
        name: input.company.name,
        slug: input.company.slug,
        createdAt: now,
      });

      const [createdMember] = await tx
        .insert(member)
        .values({
          id: newId("member"),
          organizationId,
          userId,
          role: "owner",
          createdAt: now,
        })
        .returning({ role: member.role });

      const [createdCompany] = await tx
        .insert(companies)
        .values({
          organizationId,
          name: input.company.name,
          slug: input.company.slug,
          type: input.company.type,
          timezone: input.company.timezone,
        })
        .returning({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          type: companies.type,
          timezone: companies.timezone,
        });

      if (!createdUser || !createdMember || !createdCompany) {
        throw new Error("Cadastro não retornou as linhas criadas.");
      }

      return { user: createdUser, company: createdCompany, role: createdMember.role };
    });
  } catch (error) {
    throw toSignUpError(error);
  }
}

function toSignUpError(error: unknown): unknown {
  const failure = findPostgresFailure(error);

  if (failure?.sqlState !== UNIQUE_VIOLATION || !failure.constraint) {
    return error;
  }

  const code = CONFLICT_BY_CONSTRAINT[failure.constraint];

  return code ? new SignUpConflictError(code, CONFLICT_MESSAGE[code]) : error;
}
