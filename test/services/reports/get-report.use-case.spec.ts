import { describe, expect, it } from "vitest";
import { GetReportUseCase } from "@services/reports/application/get-report.use-case";
import {
  ReportRepository,
  type ReportRange,
} from "@services/reports/application/report.repository";
import { InMemoryCompanyRepository } from "../companies/in-memory-company.repository";

const company = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Hotel Central",
  slug: "hotel-central",
  type: "hotel",
  timezone: "America/Sao_Paulo",
};

const aggregated = {
  summary: {
    totalBookings: 4,
    paidBookings: 3,
    cancelledBookings: 1,
    occupancyRate: 25,
    cancellationRate: 25,
    revenueInCents: 30_000,
    averageTicketInCents: 10_000,
    peakHour: 9,
  },
  occupancyByRoom: [],
  occupancyByDay: [],
  revenueByRoom: [],
};

class FakeReportRepository extends ReportRepository {
  lastRange: ReportRange | null = null;

  async aggregate(range: ReportRange) {
    this.lastRange = range;
    return aggregated;
  }
}

describe("GetReportUseCase", () => {
  it("resolve o período no fuso do tenant e devolve a agregação", async () => {
    const companies = new InMemoryCompanyRepository();
    companies.add(company);
    const reports = new FakeReportRepository();

    const result = await new GetReportUseCase(companies, reports).execute({
      companyId: company.id,
      from: "2030-06-01",
      to: "2030-06-30",
    });

    expect(result).toEqual({
      period: { from: "2030-06-01", to: "2030-06-30" },
      timezone: company.timezone,
      ...aggregated,
    });
    expect(reports.lastRange).toMatchObject({
      companyId: company.id,
      fromDate: "2030-06-01",
      toDate: "2030-06-30",
    });
    expect(reports.lastRange?.from.toISOString()).toBe("2030-06-01T03:00:00.000Z");
    expect(reports.lastRange?.toExclusive.toISOString()).toBe("2030-07-01T03:00:00.000Z");
  });

  it("recusa período invertido ou maior que um ano", async () => {
    const companies = new InMemoryCompanyRepository();
    companies.add(company);
    const useCase = new GetReportUseCase(companies, new FakeReportRepository());

    await expect(
      useCase.execute({ companyId: company.id, from: "2030-07-01", to: "2030-06-01" }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      useCase.execute({ companyId: company.id, from: "2030-01-01", to: "2031-01-02" }),
    ).rejects.toThrow(/366 dias/);
  });

  it("resolve limites civis de um dia de 23 horas na transição DST", async () => {
    const companies = new InMemoryCompanyRepository();
    const newYorkCompany = {
      ...company,
      id: "22222222-2222-4222-8222-222222222222",
      slug: "hotel-new-york",
      timezone: "America/New_York",
    };
    companies.add(newYorkCompany);
    const reports = new FakeReportRepository();

    await new GetReportUseCase(companies, reports).execute({
      companyId: newYorkCompany.id,
      from: "2026-03-08",
      to: "2026-03-08",
    });

    expect(reports.lastRange?.from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(reports.lastRange?.toExclusive.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
