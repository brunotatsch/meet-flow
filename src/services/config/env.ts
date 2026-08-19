import { z } from "zod";
import { EnvironmentValidationError } from "./environment-error";

const secureSslModes = new Set(["require", "verify-ca", "verify-full"]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.url(),
    /**
     * Origens adicionais autorizadas a enviar credenciais para a API, separadas
     * por vírgula. `APP_URL` é sempre incluída, então uma configuração vazia
     * continua segura por padrão.
     */
    CORS_ALLOWED_ORIGINS: z.string().default(""),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /**
     * Chave de assinatura do Better Auth (cookies de sessão, tokens de verificação).
     * Trocá-la invalida todas as sessões emitidas; nunca pode vazar nem ser
     * compartilhada entre ambientes.
     */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** URL pública onde o handler `/api/auth/*` responde. */
    BETTER_AUTH_URL: z.url(),
  })
  .superRefine(({ APP_URL, CORS_ALLOWED_ORIGINS, DATABASE_URL, NODE_ENV }, context) => {
    const origins = [APP_URL, ...CORS_ALLOWED_ORIGINS.split(",")]
      .map((origin) => origin.trim())
      .filter(Boolean);

    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin.replace(/\/$/, ""))
          throw new Error("origin must not include a path");
      } catch {
        context.addIssue({
          code: "custom",
          path: ["CORS_ALLOWED_ORIGINS"],
          message: `origem CORS inválida: ${origin}`,
        });
      }
    }

    if (NODE_ENV !== "production") return;

    const databaseUrl = new URL(DATABASE_URL);

    if (databaseUrl.port !== "6543") {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "produção exige o Transaction pooler do Supabase na porta 6543",
      });
    }

    if (!secureSslModes.has(databaseUrl.searchParams.get("sslmode") ?? "")) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "produção exige sslmode=require, verify-ca ou verify-full",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new EnvironmentValidationError(
      `Variáveis de ambiente inválidas ou ausentes:\n${details}`,
    );
  }

  return result.data;
}

export const env = loadEnv();
