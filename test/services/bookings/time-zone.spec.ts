import { describe, expect, it } from "vitest";
import {
  formatIsoWithOffset,
  nextCalendarDate,
  parseCalendarDate,
  timeZoneOffsetMinutes,
  weekdayOf,
  zonedTimeToInstant,
} from "@services/bookings/domain/time-zone";

const SAO_PAULO = "America/Sao_Paulo";
const NEW_YORK = "America/New_York";

/** 2026-03-08: relógio de Nova York adianta às 2h. 2026-11-01: atrasa às 2h. */
const SPRING_FORWARD = { year: 2026, month: 3, day: 8 };
const FALL_BACK = { year: 2026, month: 11, day: 1 };

function at(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

describe("timeZoneOffsetMinutes", () => {
  it("devolve -180 em São Paulo, que não tem mais horário de verão", () => {
    expect(timeZoneOffsetMinutes(SAO_PAULO, new Date("2026-01-15T12:00:00Z"))).toBe(-180);
    expect(timeZoneOffsetMinutes(SAO_PAULO, new Date("2026-07-15T12:00:00Z"))).toBe(-180);
  });

  it("acompanha a transição de horário de verão de Nova York", () => {
    expect(timeZoneOffsetMinutes(NEW_YORK, new Date("2026-03-08T06:59:59Z"))).toBe(-300);
    expect(timeZoneOffsetMinutes(NEW_YORK, new Date("2026-03-08T07:00:00Z"))).toBe(-240);
  });

  it("devolve 0 em UTC e offset positivo a leste de Greenwich", () => {
    expect(timeZoneOffsetMinutes("UTC", new Date("2026-06-01T00:00:00Z"))).toBe(0);
    expect(timeZoneOffsetMinutes("Asia/Kolkata", new Date("2026-06-01T00:00:00Z"))).toBe(330);
  });
});

describe("zonedTimeToInstant", () => {
  it("resolve horário de parede em São Paulo", () => {
    const instant = zonedTimeToInstant(SAO_PAULO, { year: 2026, month: 9, day: 1 }, at(9));

    expect(instant.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("aplica o offset de cada lado da transição no mesmo dia", () => {
    expect(zonedTimeToInstant(NEW_YORK, SPRING_FORWARD, at(0)).toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(zonedTimeToInstant(NEW_YORK, SPRING_FORWARD, at(6)).toISOString()).toBe(
      "2026-03-08T10:00:00.000Z",
    );
  });

  it("empurra para frente o horário que não existe no dia em que o relógio adianta", () => {
    const instant = zonedTimeToInstant(NEW_YORK, SPRING_FORWARD, at(2, 30));

    // 02:30 foi pulada; o instante devolvido é o que o relógio local mostra como 03:30.
    expect(instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(formatIsoWithOffset(instant, NEW_YORK)).toBe("2026-03-08T03:30:00-04:00");
  });

  it("escolhe a primeira ocorrência do horário ambíguo no dia em que o relógio atrasa", () => {
    const instant = zonedTimeToInstant(NEW_YORK, FALL_BACK, at(1, 30));

    expect(instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(formatIsoWithOffset(instant, NEW_YORK)).toBe("2026-11-01T01:30:00-04:00");
  });

  it("resolve meia-noite corretamente, inclusive em fuso a leste", () => {
    expect(
      zonedTimeToInstant("Asia/Kolkata", { year: 2026, month: 5, day: 10 }, 0).toISOString(),
    ).toBe("2026-05-09T18:30:00.000Z");
  });
});

describe("formatIsoWithOffset", () => {
  it("serializa no fuso da empresa, com offset explícito", () => {
    expect(formatIsoWithOffset(new Date("2026-09-01T12:00:00Z"), SAO_PAULO)).toBe(
      "2026-09-01T09:00:00-03:00",
    );
  });

  it("mostra o offset mudando entre dois instantes do mesmo dia", () => {
    expect(formatIsoWithOffset(new Date("2026-03-08T06:00:00Z"), NEW_YORK)).toBe(
      "2026-03-08T01:00:00-05:00",
    );
    expect(formatIsoWithOffset(new Date("2026-03-08T07:00:00Z"), NEW_YORK)).toBe(
      "2026-03-08T03:00:00-04:00",
    );
  });

  it("usa +00:00 em UTC e minutos no offset quando o fuso pede", () => {
    expect(formatIsoWithOffset(new Date("2026-06-01T10:00:00Z"), "UTC")).toBe(
      "2026-06-01T10:00:00+00:00",
    );
    expect(formatIsoWithOffset(new Date("2026-06-01T10:00:00Z"), "Asia/Kolkata")).toBe(
      "2026-06-01T15:30:00+05:30",
    );
  });
});

describe("parseCalendarDate", () => {
  it("aceita uma data existente", () => {
    expect(parseCalendarDate("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("aceita 29 de fevereiro em ano bissexto e rejeita em ano comum", () => {
    expect(parseCalendarDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseCalendarDate("2026-02-29")).toBeNull();
  });

  it("rejeita formato fora de YYYY-MM-DD", () => {
    expect(parseCalendarDate("01/09/2026")).toBeNull();
    expect(parseCalendarDate("2026-9-1")).toBeNull();
    expect(parseCalendarDate("2026-09-01T10:00:00Z")).toBeNull();
  });

  it("rejeita mês e dia fora do calendário em vez de normalizá-los", () => {
    expect(parseCalendarDate("2026-13-01")).toBeNull();
    expect(parseCalendarDate("2026-04-31")).toBeNull();
  });
});

describe("weekdayOf", () => {
  it("mapeia a data para 0 = domingo ... 6 = sábado", () => {
    expect(weekdayOf({ year: 2026, month: 3, day: 8 })).toBe(0);
    expect(weekdayOf({ year: 2026, month: 9, day: 1 })).toBe(2);
    expect(weekdayOf({ year: 2026, month: 9, day: 5 })).toBe(6);
  });
});

describe("nextCalendarDate", () => {
  it("avança um dia comum", () => {
    expect(nextCalendarDate({ year: 2026, month: 9, day: 1 })).toEqual({
      year: 2026,
      month: 9,
      day: 2,
    });
  });

  it("vira o mês no último dia", () => {
    expect(nextCalendarDate({ year: 2026, month: 9, day: 30 })).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
  });

  it("vira o ano em 31 de dezembro", () => {
    expect(nextCalendarDate({ year: 2026, month: 12, day: 31 })).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it("atravessa 29 de fevereiro em ano bissexto", () => {
    expect(nextCalendarDate({ year: 2028, month: 2, day: 29 })).toEqual({
      year: 2028,
      month: 3,
      day: 1,
    });
  });
});
