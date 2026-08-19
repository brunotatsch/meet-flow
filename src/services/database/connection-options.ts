import type { SQL } from "bun";

const secureSslModes = new Set(["require", "verify-ca", "verify-full"]);

export function databaseUsesTls(databaseUrl: string): boolean {
  const sslMode = new URL(databaseUrl).searchParams.get("sslmode");
  return secureSslModes.has(sslMode ?? "");
}

/**
 * Cada isolate abre no máximo uma conexão cliente com o Supavisor. A plataforma
 * pode criar muitos isolates; um pool local grande multiplicaria conexões sem
 * melhorar a capacidade real do Free Tier.
 */
export function createRuntimeDatabaseOptions(databaseUrl: string): SQL.Options {
  return {
    url: databaseUrl,
    max: 1,
    idleTimeout: 20,
    maxLifetime: 300,
    connectionTimeout: 10,
    prepare: false,
    tls: databaseUsesTls(databaseUrl),
  };
}

export function createAdministrativeDatabaseOptions(databaseUrl: string): SQL.Options {
  return {
    url: databaseUrl,
    max: 1,
    idleTimeout: 5,
    connectionTimeout: 10,
    prepare: false,
    tls: databaseUsesTls(databaseUrl),
  };
}
