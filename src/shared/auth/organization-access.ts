import { createAccessControl } from "better-auth/plugins/access";

/**
 * Permissões internas do plugin Organization. A matriz de recursos do produto
 * continua em `permissions.ts`; esta configuração impede que alguém contorne as
 * nossas rotas e chame `/api/auth/organization/*` diretamente.
 */
export const organizationAccessControl = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const);

const owner = organizationAccessControl.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

const manager = organizationAccessControl.newRole({
  organization: [],
  member: [],
  invitation: ["create", "cancel"],
  team: [],
  ac: ["read"],
});

const staff = organizationAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
});

export const organizationRoles = { owner, manager, staff } as const;
