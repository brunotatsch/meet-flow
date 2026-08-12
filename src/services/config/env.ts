import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /**
   * Chave de assinatura do Better Auth (cookies de sessão, tokens de verificação).
   * Trocá-la invalida todas as sessões emitidas; nunca pode vazar nem ser
   * compartilhada entre ambientes.
   */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL pública onde o handler `/api/auth/*` responde. */
  BETTER_AUTH_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${details}`);
  }

  return result.data;
}

export const env = loadEnv();
