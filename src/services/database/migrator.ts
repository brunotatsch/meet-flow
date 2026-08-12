import { fileURLToPath } from "node:url";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

/**
 * Pasta `drizzle/` na raiz do repositório, resolvida a partir deste arquivo para
 * não depender do cwd de quem chama (script, teste ou container).
 */
const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/**
 * Aplica as migrations pendentes e fecha a conexão.
 *
 * Usa o mesmo driver da aplicação (`bun-sql`) de propósito: o `drizzle-kit migrate`
 * exigiria instalar um driver Node só para o CLI, e migrar por um driver diferente
 * do que roda em produção esconde diferenças de tipagem e de parsing.
 *
 * É idempotente: o Drizzle registra as migrations aplicadas em
 * `drizzle.__drizzle_migrations` e ignora as que já rodaram.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new SQL(databaseUrl);

  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
