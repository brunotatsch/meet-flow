import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "@services/database/schema";
import { findPostgresFailure, type PostgresFailure } from "@services/database/postgres-error";

export type TestDatabase = ReturnType<typeof createTestDatabase>;

/**
 * Conexão dedicada por arquivo de teste, com as mesmas opções do client de
 * produção (`@services/database/client`), para que os testes exercitem a mesma
 * tradução de nomes de coluna que a aplicação usa.
 */
export function createTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL ausente: a suíte e2e depende de .env.test.");
  }

  const client = new SQL(databaseUrl);

  return {
    client,
    db: drizzle(client, { schema, casing: "snake_case" as const }),
    close: () => client.end(),
  };
}

/**
 * Cria a organização do Better Auth que serve de tenant.
 *
 * `companies.organization_id` referencia `organization.id`, então toda spec que
 * insere uma `company` precisa do tenant antes. O id vira também nome e slug para
 * a spec não ter que inventar três valores só para satisfazer o `not null`.
 */
export async function insertOrganization(database: TestDatabase, id: string): Promise<string> {
  await database.db
    .insert(schema.organization)
    .values({ id, name: id, slug: id, createdAt: new Date() });

  return id;
}

export type SqlFailure = PostgresFailure;

/**
 * Executa a operação e devolve a falha do Postgres, ou `null` se ela foi aceita.
 *
 * A extração do SQLSTATE vive em `@services/database/postgres-error` porque a
 * aplicação precisa exatamente da mesma lógica para traduzir violação de
 * constraint em resposta HTTP.
 */
export async function captureSqlFailure(
  operation: () => Promise<unknown>,
): Promise<SqlFailure | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    const failure = findPostgresFailure(error);

    if (!failure) {
      throw error;
    }

    return failure;
  }
}
