import type { ReportResponse } from "@shared/schemas/report.schema";

export interface ReportRange {
  companyId: string;
  timezone: string;
  fromDate: string;
  toDate: string;
  from: Date;
  toExclusive: Date;
}

export abstract class ReportRepository {
  /**
   * Toda soma/contagem é executada pelo Postgres. O retorno já vem agregado e
   * pequeno o bastante para uma Function Serverless serializar sem pressão de
   * memória proporcional ao número de reservas.
   */
  abstract aggregate(range: ReportRange): Promise<Omit<ReportResponse, "period" | "timezone">>;
}
