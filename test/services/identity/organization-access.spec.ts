import { describe, expect, it } from "vitest";
import { organizationRoles } from "@shared/auth/organization-access";

describe("Better Auth Organization access control", () => {
  it("permite ao owner administrar membros", () => {
    expect(organizationRoles.owner.authorize({ member: ["update", "delete"] })).toEqual({
      success: true,
    });
  });

  it("permite ao manager convidar sem alterar papéis", () => {
    expect(organizationRoles.manager.authorize({ invitation: ["create"] })).toEqual({
      success: true,
    });
    expect(organizationRoles.manager.authorize({ member: ["update"] }).success).toBe(false);
  });

  it("não deixa staff administrar equipe pela API do Better Auth", () => {
    expect(organizationRoles.staff.authorize({ invitation: ["create"] }).success).toBe(false);
    expect(organizationRoles.staff.authorize({ member: ["delete"] }).success).toBe(false);
  });
});
