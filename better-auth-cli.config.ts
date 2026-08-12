import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authPlugins } from "./src/services/identity/infra/auth/auth-plugins";

/**
 * Config usada apenas por `@better-auth/cli generate`, que roda sob Node e não
 * consegue importar `@services/database/client` (driver `bun-sql`).
 *
 * Só existe para o CLI enxergar o dialeto e a lista de plugins, que é o que define
 * as tabelas emitidas. O `db` vazio nunca é usado: `generate` não abre conexão.
 * A lista de plugins vem de `auth-plugins.ts`, a mesma que o runtime usa, para o
 * schema gerado não poder divergir da aplicação.
 *
 * ```bash
 * bunx @better-auth/cli generate \
 *   --config better-auth-cli.config.ts \
 *   --output src/services/identity/infra/database/schema/auth.ts
 * ```
 *
 * A saída precisa de uma edição manual: ver o cabeçalho do arquivo gerado.
 */
export const auth = betterAuth({
  appName: "meet-flow",
  baseURL: "http://localhost:3000",
  secret: "cli-only-secret-nunca-usado-em-runtime",
  database: drizzleAdapter({}, { provider: "pg", transaction: true }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: authPlugins,
});
