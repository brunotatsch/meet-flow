import { fileURLToPath } from "node:url";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { createAdministrativeDatabaseOptions } from "./connection-options";

/**
 * Pasta `drizzle/` na raiz do repositório, resolvida a partir deste arquivo para
 * não depender do cwd de quem chama (script, teste ou container).
 */
const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

interface AppliedMigration {
  hash: string;
  created_at: string | number | bigint;
}

export class MigrationDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationDriftError";
  }
}

export function assertAppliedMigrations(
  expected: readonly Pick<MigrationMeta, "folderMillis" | "hash">[],
  applied: readonly AppliedMigration[],
): void {
  const expectedByTimestamp = new Map(
    expected.map((migration) => [String(migration.folderMillis), migration.hash]),
  );
  const appliedByTimestamp = new Map(
    applied.map((migration) => [String(migration.created_at), migration.hash]),
  );

  for (const [timestamp, expectedHash] of expectedByTimestamp) {
    const appliedHash = appliedByTimestamp.get(timestamp);

    if (!appliedHash) {
      throw new MigrationDriftError(`Migration ${timestamp} não foi aplicada.`);
    }

    if (appliedHash !== expectedHash) {
      throw new MigrationDriftError(`Migration ${timestamp} diverge do arquivo versionado.`);
    }
  }

  for (const timestamp of appliedByTimestamp.keys()) {
    if (!expectedByTimestamp.has(timestamp)) {
      throw new MigrationDriftError(
        `O banco contém a migration desconhecida ${timestamp}; o código está desatualizado.`,
      );
    }
  }
}

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
  const client = new SQL(createAdministrativeDatabaseOptions(databaseUrl));

  try {
    await migrate(drizzle(client), { migrationsFolder });

    const expected = readMigrationFiles({ migrationsFolder });
    const applied = await client.unsafe<AppliedMigration[]>(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
    );

    assertAppliedMigrations(expected, applied);
  } finally {
    await client.end();
  }
}
