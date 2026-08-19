import { loadDirectDatabaseUrl } from "@services/config/database-env";
import { EnvironmentValidationError } from "@services/config/environment-error";
import { MigrationDriftError, runMigrations } from "@services/database/migrator";
import { findPostgresUnavailableCode } from "@services/database/postgres-error";

try {
  const databaseUrl = loadDirectDatabaseUrl();

  await runMigrations(databaseUrl);

  console.log("Migrations aplicadas e cadeia verificada.");
} catch (error) {
  if (error instanceof EnvironmentValidationError || error instanceof MigrationDriftError) {
    console.error(error.message);
  } else {
    const unavailableCode = findPostgresUnavailableCode(error);

    console.error(
      unavailableCode
        ? `Não foi possível conectar usando DIRECT_DATABASE_URL (${unavailableCode}).`
        : "Falha ao aplicar migrations. Confira a conexão, as permissões e o log do Postgres.",
    );
  }

  process.exitCode = 1;
}
