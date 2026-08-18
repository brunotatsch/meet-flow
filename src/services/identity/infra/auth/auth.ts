import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { env } from "@services/config/env";
import { db } from "@services/database/client";
import * as schema from "@services/database/schema";
import { authPlugins } from "./auth-plugins";

/**
 * Instância única do Better Auth.
 *
 * Duas decisões amarram esta configuração ao modelo de tenancy do produto:
 *
 * 1. `emailAndPassword.disableSignUp` desliga `POST /api/auth/sign-up/email`.
 *    O cadastro é sempre `POST /api/v1/sign-up`, que cria usuário, organização e
 *    `company` na mesma transação. Deixar os dois caminhos abertos permitiria um
 *    usuário sem organização, e todo o isolamento por `companyId` depende de que
 *    esse estado não exista.
 * 2. Os plugins ficam em `auth-plugins.ts`, compartilhados com a config do CLI que
 *    gera o schema. É lá que `allowUserToCreateOrganization: false` fecha o caminho
 *    inverso: organização sem `company`.
 */
export const auth = betterAuth({
  appName: "meet-flow",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  /**
   * `APP_URL` é a origem da SPA, não a da API (`BETTER_AUTH_URL`). Em dev elas
   * divergem porque o Vite serve o frontend em `:5173` e faz proxy de `/api` para
   * a API em `:3000` (ver `vite.web.config.ts`): o `Origin` que chega ao Better
   * Auth é sempre `:5173`, e sem esta lista todo `sign-in`/`sign-up` do browser
   * cai em `403 INVALID_ORIGIN`. Em produção, onde reverse proxy serve os dois na
   * mesma origem, `APP_URL` coincide com `BETTER_AUTH_URL` e a entrada é inócua.
   */
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    /**
     * Faz o Better Auth agrupar as escritas de um mesmo endpoint em uma transação
     * (por exemplo `user` + `account` no cadastro interno).
     */
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    // Espelha `SignUpSchema` em `@shared/schemas/company.schema`.
    minPasswordLength: 8,
    maxPasswordLength: 72,
  },
  plugins: authPlugins,
  databaseHooks: {
    session: {
      create: {
        /**
         * Resolve a organização ativa no momento em que a sessão nasce, para que
         * `requireAuth` não precise adivinhar o tenant a cada requisição.
         *
         * O `member` já existe aqui: o login só acontece depois que a transação de
         * cadastro comitou.
         */
        before: async (session) => {
          const [membership] = await db
            .select({ organizationId: schema.member.organizationId })
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId))
            .limit(1);

          if (!membership) return;

          return { data: { ...session, activeOrganizationId: membership.organizationId } };
        },
      },
    },
  },
});
