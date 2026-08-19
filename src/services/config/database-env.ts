import { z } from "zod";
import {
  assertLocalSupabaseDatabaseUrl,
  LOCAL_SUPABASE_DATABASE_URL,
  loadDevelopmentDatabaseMode,
} from "./development-database";
import { EnvironmentValidationError } from "./environment-error";

const secureSslModes = new Set(["require", "verify-ca", "verify-full"]);

const directDatabaseEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEV_DATABASE_MODE: z.enum(["local", "remote"]).default("local"),
    DIRECT_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  })
  .superRefine(({ DEV_DATABASE_MODE, DIRECT_DATABASE_URL, NODE_ENV }, context) => {
    if (NODE_ENV === "test") return;

    if (NODE_ENV === "development" && DEV_DATABASE_MODE === "local") {
      try {
        assertLocalSupabaseDatabaseUrl(DIRECT_DATABASE_URL, "DIRECT_DATABASE_URL");
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["DIRECT_DATABASE_URL"],
          message:
            error instanceof EnvironmentValidationError
              ? error.message
              : "conexão local do Supabase inválida",
        });
      }

      return;
    }

    const databaseUrl = new URL(DIRECT_DATABASE_URL);
    const environmentLabel = NODE_ENV === "production" ? "produção" : "desenvolvimento";

    if (databaseUrl.port !== "5432") {
      context.addIssue({
        code: "custom",
        path: ["DIRECT_DATABASE_URL"],
        message: `migrações em ${environmentLabel} exigem conexão direta ou Session pooler na porta 5432`,
      });
    }

    if (!secureSslModes.has(databaseUrl.searchParams.get("sslmode") ?? "")) {
      context.addIssue({
        code: "custom",
        path: ["DIRECT_DATABASE_URL"],
        message: `migrações em ${environmentLabel} exigem sslmode=require, verify-ca ou verify-full`,
      });
    }
  });

/**
 * Carrega apenas a credencial administrativa. Este módulo não importa o objeto
 * global de runtime, então Drizzle Kit e scripts one-shot não precisam receber
 * secrets do Better Auth nem inicializam o pool da aplicação.
 */
export function loadDirectDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  if ((source.NODE_ENV ?? "development") === "development") {
    const mode = loadDevelopmentDatabaseMode(source);

    if (mode === "local") return LOCAL_SUPABASE_DATABASE_URL;
  }

  const result = directDatabaseEnvSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new EnvironmentValidationError(
      `Variáveis de migração inválidas ou ausentes:\n${details}`,
    );
  }

  return result.data.DIRECT_DATABASE_URL;
}
