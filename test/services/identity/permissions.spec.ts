import { describe, expect, it } from "vitest";
import {
  AppRole,
  PermissionAction,
  PermissionResource,
  can,
  isAppRole,
} from "@shared/auth/permissions";

describe("matriz de permissões", () => {
  const expectedByRole: Record<AppRole, ReadonlySet<string>> = {
    owner: new Set([
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
    ]),
    manager: new Set([
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
    ]),
    staff: new Set([
      "room:read",
      "schedule:read",
      "booking:read",
      "booking:create",
      "booking:update",
      "booking:cancel",
      "room_block:read",
    ]),
  };

  it.each(Object.values(AppRole))("avalia exaustivamente cada ação/recurso para %s", (role) => {
    for (const resource of Object.values(PermissionResource)) {
      for (const action of Object.values(PermissionAction)) {
        expect(can(role, action, resource), `${role} ${resource}:${action}`).toBe(
          expectedByRole[role].has(`${resource}:${action}`),
        );
      }
    }
  });

  it("dá ao owner controle integral", () => {
    expect(can(AppRole.OWNER, PermissionAction.DELETE, PermissionResource.ROOM)).toBe(true);
    expect(can(AppRole.OWNER, PermissionAction.MANAGE, PermissionResource.BILLING)).toBe(true);
    expect(can(AppRole.OWNER, PermissionAction.DELETE, PermissionResource.TEAM)).toBe(true);
  });

  it("permite ao manager operar salas e reservas, mas não cobrança nem papéis", () => {
    expect(can(AppRole.MANAGER, PermissionAction.CREATE, PermissionResource.ROOM)).toBe(true);
    expect(can(AppRole.MANAGER, PermissionAction.UPDATE, PermissionResource.BOOKING)).toBe(true);
    expect(can(AppRole.MANAGER, PermissionAction.MANAGE, PermissionResource.BILLING)).toBe(false);
    expect(can(AppRole.MANAGER, PermissionAction.UPDATE, PermissionResource.TEAM)).toBe(false);
  });

  it("restringe staff às operações da agenda", () => {
    expect(can(AppRole.STAFF, PermissionAction.READ, PermissionResource.ROOM)).toBe(true);
    expect(can(AppRole.STAFF, PermissionAction.CREATE, PermissionResource.BOOKING)).toBe(true);
    expect(can(AppRole.STAFF, PermissionAction.CREATE, PermissionResource.ROOM)).toBe(false);
    expect(can(AppRole.STAFF, PermissionAction.DELETE, PermissionResource.ROOM)).toBe(false);
    expect(can(AppRole.STAFF, PermissionAction.UPDATE, PermissionResource.SCHEDULE)).toBe(false);
  });

  it("nega por padrão qualquer papel desconhecido", () => {
    expect(isAppRole("member")).toBe(false);
    expect(can("member", PermissionAction.READ, PermissionResource.ROOM)).toBe(false);
  });
});
