/**
 * Matriz única de autorização consumida pelo backend e pela SPA.
 *
 * A UI usa `can` apenas para não oferecer ações impossíveis; o backend sempre
 * repete a mesma decisão em um preHandler antes de executar qualquer mutação.
 */
export const AppRole = {
  OWNER: "owner",
  MANAGER: "manager",
  STAFF: "staff",
} as const;

export type AppRole = (typeof AppRole)[keyof typeof AppRole];

export const PermissionResource = {
  ROOM: "room",
  SCHEDULE: "schedule",
  BOOKING: "booking",
  TEAM: "team",
  BILLING: "billing",
  REPORT: "report",
  ROOM_BLOCK: "room_block",
} as const;

export type PermissionResource =
  (typeof PermissionResource)[keyof typeof PermissionResource];

export const PermissionAction = {
  READ: "read",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  CANCEL: "cancel",
  INVITE: "invite",
  MANAGE: "manage",
} as const;

export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

type Permission = `${PermissionResource}:${PermissionAction}`;

const ALL_PERMISSIONS = new Set<Permission>([
  "room:read",
  "room:create",
  "room:update",
  "room:delete",
  "schedule:read",
  "schedule:update",
  "booking:read",
  "booking:create",
  "booking:update",
  "booking:cancel",
  "team:read",
  "team:invite",
  "team:update",
  "team:delete",
  "billing:read",
  "billing:manage",
  "report:read",
  "room_block:read",
  "room_block:create",
  "room_block:update",
  "room_block:delete",
]);

const MANAGER_PERMISSIONS = new Set<Permission>([
  "room:read",
  "room:create",
  "room:update",
  "room:delete",
  "schedule:read",
  "schedule:update",
  "booking:read",
  "booking:create",
  "booking:update",
  "booking:cancel",
  "team:read",
  "team:invite",
  "report:read",
  "room_block:read",
  "room_block:create",
  "room_block:update",
  "room_block:delete",
]);

const STAFF_PERMISSIONS = new Set<Permission>([
  "room:read",
  "schedule:read",
  "booking:read",
  "booking:create",
  "booking:update",
  "booking:cancel",
  "room_block:read",
]);

const PERMISSIONS_BY_ROLE: Record<AppRole, ReadonlySet<Permission>> = {
  owner: ALL_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  staff: STAFF_PERMISSIONS,
};

export function isAppRole(value: string): value is AppRole {
  return value === AppRole.OWNER || value === AppRole.MANAGER || value === AppRole.STAFF;
}

export function can(
  role: AppRole | string,
  action: PermissionAction,
  resource: PermissionResource,
): boolean {
  if (!isAppRole(role)) return false;
  return PERMISSIONS_BY_ROLE[role].has(`${resource}:${action}`);
}
