import { organization } from "better-auth/plugins/organization";
import { organizationAccessControl, organizationRoles } from "@shared/auth/organization-access";

type OrganizationOptions = NonNullable<Parameters<typeof organization>[0]>;

export interface AuthPluginOptions {
  sendInvitationEmail?: OrganizationOptions["sendInvitationEmail"];
}

/**
 * Lista de plugins do Better Auth, isolada de `auth.ts` de propósito.
 *
 * São os plugins que determinam quais tabelas o `@better-auth/cli generate` emite,
 * e o CLI roda sob Node, onde o driver `bun-sql` usado pelo client real não carrega.
 * `better-auth-cli.config.ts` (raiz do repositório) importa esta lista para gerar o
 * schema sem tocar no banco, garantindo que a geração não possa divergir do runtime.
 *
 * `allowUserToCreateOrganization: false` desliga `POST /api/auth/organization/create`:
 * organização só nasce pelo cadastro em `POST /api/v1/sign-up`, junto da `company`.
 * Uma organização sem `company` seria um tenant sem perfil de negócio, e
 * `requireAuth` não teria `companyId` para resolver.
 */
export function createAuthPlugins(options: AuthPluginOptions = {}) {
  const organizationPlugin = organization({
    allowUserToCreateOrganization: false,
    creatorRole: "owner",
    invitationExpiresIn: 48 * 60 * 60,
    cancelPendingInvitationsOnReInvite: true,
    sendInvitationEmail: options.sendInvitationEmail,
    ac: organizationAccessControl,
    roles: organizationRoles,
  });

  return [organizationPlugin] as [typeof organizationPlugin];
}

/**
 * A anotação de tupla não é decorativa: sem ela o TypeScript alarga o literal para
 * `Plugin[]` e o `betterAuth()` perde a inferência dos campos que o plugin adiciona,
 * a começar por `session.activeOrganizationId`, que `requireAuth` lê.
 */
export const authPlugins = createAuthPlugins();
