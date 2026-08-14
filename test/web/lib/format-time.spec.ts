import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarDateStringInZone,
  formatDurationMinutes,
  formatTimeInZone,
  minutesFromMidnightInZone,
  todayIsoDateInZone,
} from "@web/lib/format-time";

describe("formatTimeInZone", () => {
  it("formata no fuso informado, não no fuso local do processo", () => {
    expect(formatTimeInZone("2030-06-04T09:00:00-03:00", "America/Sao_Paulo")).toBe("09:00");
  });

  it("converte corretamente entre fusos diferentes", () => {
    // 09:00 em São Paulo (UTC-3) é 13:00 em Londres em junho (BST, UTC+1).
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

describe("minutesFromMidnightInZone", () => {
  it("converte meia-noite para 0", () => {
    expect(minutesFromMidnightInZone("2030-06-04T00:00:00-03:00", "America/Sao_Paulo")).toBe(0);
  });

  it("converte um horário qualquer no fuso informado", () => {
    expect(minutesFromMidnightInZone("2030-06-04T09:30:00-03:00", "America/Sao_Paulo")).toBe(570);
  });

  it("converte no fuso pedido, não no fuso embutido no offset do ISO", () => {
    // 09:00 em São Paulo (UTC-3) é 13:00 em Londres (BST, UTC+1) em junho.
    expect(minutesFromMidnightInZone("2030-06-04T09:00:00-03:00", "Europe/London")).toBe(780);
  });

  it("converte perto da virada do dia", () => {
    expect(minutesFromMidnightInZone("2030-06-04T23:59:00-03:00", "America/Sao_Paulo")).toBe(1_439);
  });
});

describe("calendarDateStringInZone", () => {
  it("formata a data no fuso informado", () => {
    expect(calendarDateStringInZone("2030-06-04T09:00:00-03:00", "America/Sao_Paulo")).toBe(
      "2030-06-04",
    );
  });

  it("cai no dia seguinte perto da virada, num fuso à frente", () => {
    // 23:30 em São Paulo (UTC-3) já é 02:30 do dia seguinte em Londres (BST, UTC+1).
    expect(calendarDateStringInZone("2030-06-04T23:30:00-03:00", "Europe/London")).toBe(
      "2030-06-05",
    );
  });
});

describe("todayIsoDateInZone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa a data do fuso informado, não a data UTC do relógio do sistema", () => {
    // 2030-06-05T01:00:00Z já é dia 5 em UTC, mas ainda é 22h do dia 4 em São Paulo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-05T01:00:00Z"));

    expect(todayIsoDateInZone("America/Sao_Paulo")).toBe("2030-06-04");
  });

  it("avança o dia num fuso à frente de UTC antes da meia-noite UTC", () => {
    // 2030-06-04T23:30:00Z ainda é dia 4 em UTC, mas já é 00:30 do dia 5 em Londres.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-04T23:30:00Z"));

    expect(todayIsoDateInZone("Europe/London")).toBe("2030-06-05");
  });
});
