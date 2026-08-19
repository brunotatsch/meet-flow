import { EnvironmentValidationError } from "./environment-error";

const secureSslModes = new Set(["require", "verify-ca", "verify-full"]);
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export const LOCAL_SUPABASE_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type DevelopmentDatabaseMode = "local" | "remote";

function parsedConnection(databaseUrl: string, variable: string): URL {
  try {
    const parsed = new URL(databaseUrl);

    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }

    return parsed;
  } catch {
    throw new EnvironmentValidationError(`${variable} não é uma URL PostgreSQL válida.`);
  }
}

export function loadDevelopmentDatabaseMode(
  source: NodeJS.ProcessEnv = process.env,
): DevelopmentDatabaseMode {
  const mode = source.DEV_DATABASE_MODE ?? "local";

  if (mode !== "local" && mode !== "remote") {
    throw new EnvironmentValidationError("DEV_DATABASE_MODE deve ser 'local' ou 'remote'.");
  }

  return mode;
}

function looksLikeLocalConnection(databaseUrl: string): boolean {
  try {
    return localHosts.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export function assertLocalSupabaseDatabaseUrl(databaseUrl: string, variable: string): void {
  const connection = parsedConnection(databaseUrl, variable);
  const sslMode = connection.searchParams.get("sslmode");

  if (!localHosts.has(connection.hostname)) {
    throw new EnvironmentValidationError(`${variable} local deve apontar para um host loopback.`);
  }

  if (connection.port !== "54322") {
    throw new EnvironmentValidationError(
      `${variable} local deve usar a porta 54322 do Supabase CLI.`,
    );
  }

  if (connection.pathname !== "/postgres") {
    throw new EnvironmentValidationError(`${variable} local deve apontar para o banco postgres.`);
  }

  if (sslMode && sslMode !== "disable") {
    throw new EnvironmentValidationError(
      `${variable} local não deve exigir TLS; remova sslmode ou use sslmode=disable.`,
    );
  }
}

function projectRef(databaseUrl: URL): string | null {
  const usernameMatch = decodeURIComponent(databaseUrl.username).match(/^postgres\.([a-z0-9]+)$/i);
  const hostnameMatch = databaseUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  return usernameMatch?.[1] ?? hostnameMatch?.[1] ?? null;
}

export function assertDevelopmentRuntimeDatabaseUrl(
  runtimeUrl: string,
  mode: DevelopmentDatabaseMode = looksLikeLocalConnection(runtimeUrl) ? "local" : "remote",
): void {
  if (mode === "local") {
    assertLocalSupabaseDatabaseUrl(runtimeUrl, "DATABASE_URL");
    return;
  }

  const runtime = parsedConnection(runtimeUrl, "DATABASE_URL");

  if (runtime.port !== "6543") {
    throw new EnvironmentValidationError(
      "DATABASE_URL deve usar o Transaction pooler do Supabase na porta 6543.",
    );
  }

  if (!secureSslModes.has(runtime.searchParams.get("sslmode") ?? "")) {
    throw new EnvironmentValidationError(
      "DATABASE_URL deve usar sslmode=require, verify-ca ou verify-full.",
    );
  }
}

export function assertDevelopmentDatabaseTargets(
  runtimeUrl: string,
  directUrl: string,
  mode: DevelopmentDatabaseMode = looksLikeLocalConnection(runtimeUrl) ? "local" : "remote",
): void {
  assertDevelopmentRuntimeDatabaseUrl(runtimeUrl, mode);

  if (mode === "local") {
    assertLocalSupabaseDatabaseUrl(directUrl, "DIRECT_DATABASE_URL");

    if (runtimeUrl !== directUrl) {
      throw new EnvironmentValidationError(
        "No modo local, DATABASE_URL e DIRECT_DATABASE_URL devem ser idênticas.",
      );
    }

    return;
  }

  const runtime = parsedConnection(runtimeUrl, "DATABASE_URL");
  const direct = parsedConnection(directUrl, "DIRECT_DATABASE_URL");

  if (looksLikeLocalConnection(directUrl)) {
    throw new EnvironmentValidationError(
      "Não misture DATABASE_URL remota com DIRECT_DATABASE_URL local.",
    );
  }

  if (direct.port !== "5432") {
    throw new EnvironmentValidationError(
      "DIRECT_DATABASE_URL deve usar conexão direta ou Session pooler na porta 5432.",
    );
  }

  if (!secureSslModes.has(direct.searchParams.get("sslmode") ?? "")) {
    throw new EnvironmentValidationError(
      "DIRECT_DATABASE_URL deve usar sslmode=require, verify-ca ou verify-full.",
    );
  }

  if (runtime.pathname !== direct.pathname) {
    throw new EnvironmentValidationError(
      "DATABASE_URL e DIRECT_DATABASE_URL apontam para bancos diferentes.",
    );
  }

  const runtimeRef = projectRef(runtime);
  const directRef = projectRef(direct);

  if (runtimeRef && directRef && runtimeRef !== directRef) {
    throw new EnvironmentValidationError(
      "DATABASE_URL e DIRECT_DATABASE_URL apontam para projetos Supabase diferentes.",
    );
  }
}
