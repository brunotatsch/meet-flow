import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import {
  organizationAccessControl,
  organizationRoles,
} from "@shared/auth/organization-access";

/**
 * Sem `baseURL`: o client do better-auth cai no fallback `window.location.origin`
 * e usa `/api/auth` como basePath padrão, o que dá o mesmo efeito de um baseURL
 * relativo, funcionando atrás do proxy do Vite em dev (`vite.web.config.ts`) e
 * atrás de um reverse proxy que sirva API e SPA na mesma origem em produção, sem
 * reescrever URL por ambiente. Passar `baseURL: "/api/auth"` explicitamente quebra:
 * essa versão da lib faz `new URL(baseURL)` sem base e uma URL relativa lança
 * `Invalid base URL`, exceção que sobe até o `render()` do React e deixa a tela em
 * branco. O caminho final precisa bater com o prefixo montado em `server.ts`
 * (`app.register(registerAuthHandler, { prefix: "/api/auth" })`).
 *
 * `organizationClient()` espelha o plugin `organization` do servidor
 * (`src/services/identity/infra/auth/auth-plugins.ts`): sem ele, `session` não
 * teria `activeOrganizationId` tipado no client.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac: organizationAccessControl, roles: organizationRoles })],
});

export const { useSession, signIn, signOut } = authClient;
