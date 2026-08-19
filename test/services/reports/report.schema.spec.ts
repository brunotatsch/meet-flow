import { describe, expect, it } from "vitest";
import { REPORT_MAX_DAYS, ReportPeriodSchema } from "@shared/schemas/report.schema";

describe("ReportPeriodSchema", () => {
  it("aceita até 366 dias inclusivos", () => {
    expect(ReportPeriodSchema.safeParse({ from: "2032-01-01", to: "2032-12-31" }).success).toBe(
      true,
    );
    expect(REPORT_MAX_DAYS).toBe(366);
  });

  it("recusa período invertido, data inexistente e 367 dias", () => {
    expect(ReportPeriodSchema.safeParse({ from: "2030-06-02", to: "2030-06-01" }).success).toBe(
      false,
    );
    expect(ReportPeriodSchema.safeParse({ from: "2030-02-30", to: "2030-03-01" }).success).toBe(
      false,
    );
    const tooLong = ReportPeriodSchema.safeParse({ from: "2032-01-01", to: "2033-01-01" });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues[0]?.message).toMatch(/366 dias/);
  });
});
