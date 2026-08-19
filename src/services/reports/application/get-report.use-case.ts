import { REPORT_MAX_DAYS, type ReportResponse } from "@shared/schemas/report.schema";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { CompanyNotFoundError } from "@services/companies/domain/errors";
import {
  nextCalendarDate,
  parseCalendarDate,
  zonedTimeToInstant,
} from "@services/bookings/domain/time-zone";
import type { ReportRepository } from "./report.repository";

export interface GetReportCommand {
  companyId: string;
  from: string;
  to: string;
}

const DAY_IN_MS = 86_400_000;

export class GetReportUseCase {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly reports: ReportRepository,
  ) {}

  async execute(command: GetReportCommand): Promise<ReportResponse> {
    const company = await this.companies.findById(command.companyId);
    if (!company) throw new CompanyNotFoundError(command.companyId);

    const fromDate = parseCalendarDate(command.from);
    const toDate = parseCalendarDate(command.to);
    if (!fromDate || !toDate || command.to < command.from) {
      throw new RangeError("Período de relatório inválido.");
    }

    const approximateDays =
      (Date.UTC(toDate.year, toDate.month - 1, toDate.day) -
        Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day)) /
        DAY_IN_MS +
      1;
    if (approximateDays > REPORT_MAX_DAYS) {
      throw new RangeError(`O período máximo do relatório é de ${REPORT_MAX_DAYS} dias.`);
    }

    const aggregated = await this.reports.aggregate({
      companyId: company.id,
      timezone: company.timezone,
      fromDate: command.from,
      toDate: command.to,
      from: zonedTimeToInstant(company.timezone, fromDate, 0),
      toExclusive: zonedTimeToInstant(company.timezone, nextCalendarDate(toDate), 0),
    });

    return {
      period: { from: command.from, to: command.to },
      timezone: company.timezone,
      ...aggregated,
    };
  }
}
