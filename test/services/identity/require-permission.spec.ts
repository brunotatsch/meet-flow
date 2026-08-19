import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { PermissionAction, PermissionResource } from "@shared/auth/permissions";
import { requirePermission } from "@services/identity/infra/http/require-permission";

function requestWithRole(role: string): FastifyRequest {
  return {
    auth: {
      userId: "user-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      organizationId: "org-1",
      role,
    },
  } as FastifyRequest;
}

describe("requirePermission", () => {
  it("autoriza um papel com a permissão pedida", async () => {
    await expect(
      requirePermission(PermissionAction.CREATE, PermissionResource.ROOM)(
        requestWithRole("manager"),
      ),
    ).resolves.toBeUndefined();
  });

  it("recusa staff em mutação de sala", async () => {
    await expect(
      requirePermission(PermissionAction.CREATE, PermissionResource.ROOM)(
        requestWithRole("staff"),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("recusa papéis desconhecidos", async () => {
    await expect(
      requirePermission(PermissionAction.READ, PermissionResource.ROOM)(
        requestWithRole("member"),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});
