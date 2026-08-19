import { describe, expect, it } from "vitest";
import type { ReportResponse } from "@shared/schemas/report.schema";
import { reportToCsv } from "@services/reports/infra/http/report.controller";

describe("reportToCsv", () => {
  it("gera UTF-8/BOM, separador de planilha e escapa nomes", () => {
    const report: ReportResponse = {
      period: { from: "2030-06-01", to: "2030-06-30" },
      timezone: "America/Sao_Paulo",
      summary: {
        totalBookings: 2,
        paidBookings: 1,
        cancelledBookings: 1,
        occupancyRate: 12.5,
        cancellationRate: 50,
        revenueInCents: 10_000,
        averageTicketInCents: 10_000,
        peakHour: 9,
      },
      occupancyByRoom: [
        {
          roomId: "11111111-1111-4111-8111-111111111111",
          roomName: "Sala; Norte",
          bookedMinutes: 60,
          availableMinutes: 480,
          occupancyRate: 12.5,
        },
      ],
      occupancyByDay: [
        {
          date: "2030-06-01",
          bookedMinutes: 60,
          availableMinutes: 480,
          occupancyRate: 12.5,
        },
      ],
      revenueByRoom: [
        {
          roomId: "11111111-1111-4111-8111-111111111111",
          roomName: "Sala; Norte",
          bookings: 1,
          revenueInCents: 10_000,
        },
      ],
    };

    const csv = reportToCsv(report);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Sala; Norte";1;10000;60,00;480,00;12,50');
    expect(csv).toContain("Horário de pico;9:00");
    expect(csv).toContain("Data;Minutos ocupados;Minutos disponíveis;Ocupação (%)");
    expect(csv).toContain("2030-06-01;60,00;480,00;12,50");
    expect(csv).toContain("\r\n");
  });

  it("neutraliza células controladas pelo usuário que iniciariam fórmulas", () => {
    const roomId = "11111111-1111-4111-8111-111111111111";
    const report: ReportResponse = {
      period: { from: "2030-06-01", to: "2030-06-01" },
      timezone: "UTC",
      summary: {
        totalBookings: 0,
        paidBookings: 0,
        cancelledBookings: 0,
        occupancyRate: 0,
        cancellationRate: 0,
        revenueInCents: 0,
        averageTicketInCents: 0,
        peakHour: null,
      },
      occupancyByRoom: [
        {
          roomId,
          roomName: '=HYPERLINK("https://invalid")',
          bookedMinutes: 0,
          availableMinutes: 0,
          occupancyRate: 0,
        },
      ],
      occupancyByDay: [],
      revenueByRoom: [
        {
          roomId,
          roomName: '=HYPERLINK("https://invalid")',
          bookings: 0,
          revenueInCents: 0,
        },
      ],
    };

    expect(reportToCsv(report)).toContain(`"'=HYPERLINK(""https://invalid"")";0;0;0,00;0,00;0,00`);
  });
});
