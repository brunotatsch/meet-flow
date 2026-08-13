import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * `baseURL` relativo: funciona atrás do proxy do Vite em dev (`vite.web.config.ts`)
 * e atrás de um reverse proxy que sirva API e SPA na mesma origem em produção, sem
 * reescrever URL por ambiente. O caminho precisa bater com o prefixo montado em
 * `server.ts` (`app.register(registerAuthHandler, { prefix: "/api/auth" })`).
 *
 * `organizationClient()` espelha o plugin `organization` do servidor
 * (`src/services/identity/infra/auth/auth-plugins.ts`): sem ele, `session` não
 * teria `activeOrganizationId` tipado no client.
 */
export const authClient = createAuthClient({
  baseURL: "/api/auth",
  plugins: [organizationClient()],
});

export const { useSession, signIn, signOut } = authClient;
