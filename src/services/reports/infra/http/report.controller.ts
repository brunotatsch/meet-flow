import type { FastifyReply, FastifyRequest } from "fastify";
import { ReportPeriodSchema, type ReportResponse } from "@shared/schemas/report.schema";
import { getRequestAuth } from "@services/identity/infra/http/require-auth";
import { HttpError } from "@services/http/http-error";
import type { GetReportUseCase } from "../../application/get-report.use-case";

export class ReportController {
  constructor(private readonly getReport: GetReportUseCase) {}

  async show(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.send(await this.execute(request));
  }

  async csv(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const report = await this.execute(request);
    const filename = `relatorio-${report.period.from}-a-${report.period.to}.csv`;

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(reportToCsv(report));
  }

  private async execute(request: FastifyRequest): Promise<ReportResponse> {
    const parsed = ReportPeriodSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Período do relatório inválido.",
        parsed.error.issues,
      );
    }

    const { companyId } = getRequestAuth(request);

    try {
      return await this.getReport.execute({ companyId, ...parsed.data });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new HttpError(400, "INVALID_REPORT_PERIOD", error.message);
      }
      throw error;
    }
  }
}

/** CSV tabular, estável, UTF-8/BOM e protegido contra fórmulas injetadas em planilhas. */
export function reportToCsv(report: ReportResponse): string {
  const rows: Array<Array<string | number>> = [
    ["Métrica", "Valor"],
    ["Período inicial", report.period.from],
    ["Período final", report.period.to],
    ["Fuso horário", report.timezone],
    ["Reservas", report.summary.totalBookings],
    ["Reservas pagas", report.summary.paidBookings],
    ["Reservas canceladas", report.summary.cancelledBookings],
    ["Ocupação (%)", decimal(report.summary.occupancyRate)],
    ["Cancelamento (%)", decimal(report.summary.cancellationRate)],
    ["Receita (centavos)", report.summary.revenueInCents],
    ["Ticket médio (centavos)", report.summary.averageTicketInCents],
    ["Horário de pico", report.summary.peakHour === null ? "" : `${report.summary.peakHour}:00`],
    [],
    [
      "Sala",
      "Reservas pagas",
      "Receita (centavos)",
      "Minutos ocupados",
      "Minutos disponíveis",
      "Ocupação (%)",
    ],
    ...report.revenueByRoom.map((revenue) => {
      const occupancy = report.occupancyByRoom.find((room) => room.roomId === revenue.roomId);
      return [
        revenue.roomName,
        revenue.bookings,
        revenue.revenueInCents,
        decimal(occupancy?.bookedMinutes ?? 0),
        decimal(occupancy?.availableMinutes ?? 0),
        decimal(occupancy?.occupancyRate ?? 0),
      ];
    }),
    [],
    ["Data", "Minutos ocupados", "Minutos disponíveis", "Ocupação (%)"],
    ...report.occupancyByDay.map((day) => [
      day.date,
      decimal(day.bookedMinutes),
      decimal(day.availableMinutes),
      decimal(day.occupancyRate),
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

function decimal(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
