import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { loadDirectDatabaseUrl } from "@services/config/database-env";
import {
  assertDevelopmentDatabaseTargets,
  assertDevelopmentRuntimeDatabaseUrl,
  loadDevelopmentDatabaseMode,
} from "@services/config/development-database";
import { EnvironmentValidationError } from "@services/config/environment-error";
import { createAdministrativeDatabaseOptions } from "@services/database/connection-options";
import { findPostgresUnavailableCode } from "@services/database/postgres-error";

let checkTarget = "DATABASE_URL";

async function checkDevelopmentDatabase(): Promise<void> {
  const mode = loadDevelopmentDatabaseMode();
  // O import valida DATABASE_URL antes de criar qualquer pool.
  const { env } = await import("@services/config/env");
  assertDevelopmentRuntimeDatabaseUrl(env.DATABASE_URL, mode);

  checkTarget = "DIRECT_DATABASE_URL";
  const directDatabaseUrl = loadDirectDatabaseUrl();
  assertDevelopmentDatabaseTargets(env.DATABASE_URL, directDatabaseUrl, mode);

  const [{ assertDatabaseReady }, { databaseClient }] = await Promise.all([
    import("@services/database/readiness"),
    import("@services/database/client"),
  ]);

  checkTarget = "DIRECT_DATABASE_URL";
  const directClient = new SQL(createAdministrativeDatabaseOptions(directDatabaseUrl));

  try {
    const directDatabase = drizzle(directClient);
    await assertDatabaseReady((query) => directDatabase.execute(query));
  } finally {
    await directClient.end();
  }

  checkTarget = "DATABASE_URL";

  try {
    await assertDatabaseReady();
  } finally {
    await databaseClient.end();
  }
}

try {
  await checkDevelopmentDatabase();
  const mode = loadDevelopmentDatabaseMode();
  console.log(
    mode === "local"
      ? "Supabase local conectado; schema Drizzle atualizado."
      : "Supabase remoto conectado pelas URLs direta e pooled; schema atualizado.",
  );
} catch (error) {
  if (error instanceof EnvironmentValidationError) {
    console.error(error.message);
  } else if (error instanceof Error && error.name === "DatabaseSchemaNotReadyError") {
    console.error(
      `${checkTarget} conecta, mas está sem a migration mais recente. Execute 'bun run db:migrate' e tente novamente.`,
    );
  } else {
    const unavailableCode = findPostgresUnavailableCode(error);

    if (unavailableCode) {
      console.error(
        `Não foi possível conectar usando ${checkTarget} (${unavailableCode}). Revise a URL e a senha no arquivo .env.`,
      );
    } else {
      console.error(
        `Falha inesperada ao validar ${checkTarget}. Consulte o log da API pelo requestId e revise o .env.`,
      );
    }
  }

  process.exitCode = 1;
}
