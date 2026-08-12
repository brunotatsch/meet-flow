import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "@services/database/schema";

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

export interface SqlFailure {
  /** SQLSTATE: `23P01` exclusão, `23514` check, `23503` FK, `428C9` coluna gerada. */
  sqlState: string;
  /** Nome da constraint violada, quando o Postgres o informa. */
  constraint: string | null;
}

/**
 * Executa a operação e devolve a falha do Postgres, ou `null` se ela foi aceita.
 *
 * Duas particularidades da stack justificam este helper, e a MVP-07 vai precisar
 * das duas para traduzir conflito em 409:
 *
 * 1. o Drizzle embrulha o erro do driver em `DrizzleQueryError`, então o erro do
 *    Postgres só aparece descendo a cadeia de `cause`;
 * 2. o driver do Bun põe o SQLSTATE em `errno` e reserva `code` para o rótulo
 *    genérico `ERR_POSTGRES_SERVER_ERROR`.
 */
export async function captureSqlFailure(
  operation: () => Promise<unknown>,
): Promise<SqlFailure | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    const failure = findPostgresError(error);

    if (!failure) {
      throw error;
    }

    return failure;
  }
}

function findPostgresError(error: unknown): SqlFailure | null {
  let current = error;

  while (current instanceof Error) {
    const { errno, constraint } = current as unknown as {
      errno?: unknown;
      constraint?: unknown;
    };

    if (typeof errno === "string") {
      return {
        sqlState: errno,
        constraint: typeof constraint === "string" ? constraint : null,
      };
    }

    current = current.cause;
  }

  return null;
}
