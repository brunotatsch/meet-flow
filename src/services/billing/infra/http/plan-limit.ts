import type { FastifyRequest } from "fastify";
import { getPublicCompany } from "@services/companies/infra/http/resolve-company-slug";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import type { PlanAccessService } from "../../application/plan-access.service";
import type { LimitedResource } from "../../domain/plan";
import { PlanLimitExceededError } from "../../domain/errors";
import { planLimitHttpError } from "./billing-error";

export function createPlanLimitPreHandler(
  access: PlanAccessService,
  resource: LimitedResource,
  tenancy: "authenticated" | "public",
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const companyId =
      tenancy === "authenticated"
        ? getRequestAuth(request).companyId
        : getPublicCompany(request).id;

    try {
      await access.assertCanCreate(companyId, resource);
    } catch (error) {
      if (error instanceof PlanLimitExceededError) throw planLimitHttpError(error);
      throw error;
    }
  };
}
