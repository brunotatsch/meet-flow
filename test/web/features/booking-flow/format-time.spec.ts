import { describe, expect, it } from "vitest";
import {
  formatDurationMinutes,
  formatTimeInZone,
} from "@web/features/booking-flow/lib/format-time";

describe("formatTimeInZone", () => {
  it("formata no fuso informado, não no fuso local do processo", () => {
    expect(formatTimeInZone("2030-06-04T09:00:00-03:00", "America/Sao_Paulo")).toBe("09:00");
  });

  it("converte corretamente entre fusos diferentes", () => {
    // 09:00 em São Paulo (UTC-3) é 12:00 em Londres nesse período (sem horário de verão).
    expect(formatTimeInZone("2030-06-04T09:00:00-03:00", "Europe/London")).toBe("13:00");
  });
});

describe("formatDurationMinutes", () => {
  it("formata duração menor que uma hora", () => {
    expect(formatDurationMinutes("2030-06-04T09:00:00-03:00", "2030-06-04T09:30:00-03:00")).toBe(
      "30min",
    );
  });

  it("formata duração em horas exatas", () => {
    expect(formatDurationMinutes("2030-06-04T09:00:00-03:00", "2030-06-04T11:00:00-03:00")).toBe(
      "2h",
    );
  });

  it("formata duração com horas e minutos", () => {
    expect(formatDurationMinutes("2030-06-04T09:00:00-03:00", "2030-06-04T10:30:00-03:00")).toBe(
      "1h30min",
    );
  });
});
