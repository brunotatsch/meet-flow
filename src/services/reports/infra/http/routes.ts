import type { FastifyInstance } from "fastify";
import { PermissionAction, PermissionResource } from "@shared/auth/permissions";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { requirePermission } from "@services/identity/infra/http/require-permission";
import { GetReportUseCase } from "../../application/get-report.use-case";
import { DrizzleReportRepository } from "../database/drizzle-report.repository";
import { ReportController } from "./report.controller";

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  const controller = new ReportController(
    new GetReportUseCase(new DrizzleCompanyRepository(), new DrizzleReportRepository()),
  );
  const preHandler = [
    requireAuth,
    requirePermission(PermissionAction.READ, PermissionResource.REPORT),
  ];

  app.get("/reports", { preHandler }, (request, reply) => controller.show(request, reply));
  app.get("/reports.csv", { preHandler }, (request, reply) => controller.csv(request, reply));
}
