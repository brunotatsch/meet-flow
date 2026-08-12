import { describe, expect, it } from "vitest";
import {
  buildDayAvailability,
  resolveOpeningPeriod,
  type OpeningWindow,
} from "@services/bookings/domain/availability";
import { overlaps, slotPriceInCents } from "@services/bookings/domain/slot";
import { formatIsoWithOffset } from "@services/bookings/domain/time-zone";

const NEW_YORK = "America/New_York";
const SAO_PAULO = "America/Sao_Paulo";

/** Longe de qualquer slot dos testes, para o corte de "slot já iniciado" não interferir. */
const LONG_BEFORE = new Date("2020-01-01T00:00:00Z");

function window(overrides: Partial<OpeningWindow> = {}): OpeningWindow {
  return { opensAtMinutes: 9 * 60, closesAtMinutes: 12 * 60, slotMinutes: 60, ...overrides };
}

function grid(
  timeZone: string,
  date: { year: number; month: number; day: number },
  openingWindow: OpeningWindow,
  now = LONG_BEFORE,
) {
  return buildDayAvailability({
    period: resolveOpeningPeriod(timeZone, date, openingWindow),
    slotMinutes: openingWindow.slotMinutes,
    hourlyRateInCents: 12_000,
    bookedPeriods: [],
    now,
  });
}

function labels(timeZone: string, slots: { startsAt: Date }[]): string[] {
  return slots.map((slot) => formatIsoWithOffset(slot.startsAt, timeZone));
}

describe("slotPriceInCents", () => {
  it("cobra a tarifa cheia em um slot de uma hora", () => {
    expect(slotPriceInCents(15_000, 60)).toBe(15_000);
  });

  it("é proporcional à duração do slot", () => {
    expect(slotPriceInCents(12_000, 15)).toBe(3_000);
    expect(slotPriceInCents(12_000, 30)).toBe(6_000);
    expect(slotPriceInCents(12_000, 120)).toBe(24_000);
  });

  it("arredonda meio centavo para cima, de forma determinística", () => {
    // 33 centavos/h em 30 min dá 16,5 centavos.
    expect(slotPriceInCents(33, 30)).toBe(17);
    // 10 centavos/h em 15 min dá 2,5 centavos.
    expect(slotPriceInCents(10, 15)).toBe(3);
    // 1 centavo/h em 15 min dá 0,25 centavo, que arredonda para baixo.
    expect(slotPriceInCents(1, 15)).toBe(0);
  });

  it("mantém sala gratuita gratuita", () => {
    expect(slotPriceInCents(0, 120)).toBe(0);
  });
});

describe("overlaps", () => {
  const slot = {
    startsAt: new Date("2026-09-01T12:00:00Z"),
    endsAt: new Date("2026-09-01T13:00:00Z"),
  };

  it("não considera colisão quando a reserva apenas encosta no slot", () => {
    expect(
      overlaps(slot, {
        startsAt: new Date("2026-09-01T11:00:00Z"),
        endsAt: new Date("2026-09-01T12:00:00Z"),
      }),
    ).toBe(false);
    expect(
      overlaps(slot, {
        startsAt: new Date("2026-09-01T13:00:00Z"),
        endsAt: new Date("2026-09-01T14:00:00Z"),
      }),
    ).toBe(false);
  });

  it("considera colisão parcial, contida e envolvente", () => {
    const cases = [
      ["2026-09-01T12:30:00Z", "2026-09-01T13:30:00Z"],
      ["2026-09-01T12:15:00Z", "2026-09-01T12:45:00Z"],
      ["2026-09-01T10:00:00Z", "2026-09-01T20:00:00Z"],
    ] as const;

    for (const [startsAt, endsAt] of cases) {
      expect(overlaps(slot, { startsAt: new Date(startsAt), endsAt: new Date(endsAt) })).toBe(true);
    }
  });
});

describe("buildDayAvailability", () => {
  it("monta a grade do dia em fuso sem horário de verão", () => {
    const slots = grid(SAO_PAULO, { year: 2026, month: 9, day: 1 }, window());

    expect(labels(SAO_PAULO, slots)).toEqual([
      "2026-09-01T09:00:00-03:00",
      "2026-09-01T10:00:00-03:00",
      "2026-09-01T11:00:00-03:00",
    ]);
    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it("descarta o slot que não cabe inteiro antes do fechamento", () => {
    const slots = grid(
      SAO_PAULO,
      { year: 2026, month: 9, day: 1 },
      window({ closesAtMinutes: 11 * 60 + 30 }),
    );

    expect(labels(SAO_PAULO, slots)).toEqual([
      "2026-09-01T09:00:00-03:00",
      "2026-09-01T10:00:00-03:00",
    ]);
  });

  it("não perde nem duplica slots no dia em que o relógio adianta", () => {
    const slots = grid(
      NEW_YORK,
      { year: 2026, month: 3, day: 8 },
      window({ opensAtMinutes: 0, closesAtMinutes: 6 * 60 }),
    );

    /**
     * O dia tem 5 horas reais entre 00:00 e 06:00 locais: 02:00 não existe, e a
     * grade salta de 01:00 para 03:00 sem buraco no tempo absoluto.
     */
    expect(labels(NEW_YORK, slots)).toEqual([
      "2026-03-08T00:00:00-05:00",
      "2026-03-08T01:00:00-05:00",
      "2026-03-08T03:00:00-04:00",
      "2026-03-08T04:00:00-04:00",
      "2026-03-08T05:00:00-04:00",
    ]);
    expectContiguous(slots);
  });

  it("não perde nem duplica slots no dia em que o relógio atrasa", () => {
    const slots = grid(
      NEW_YORK,
      { year: 2026, month: 11, day: 1 },
      window({ opensAtMinutes: 0, closesAtMinutes: 6 * 60 }),
    );

    /**
     * O dia tem 7 horas reais: 01:00 acontece duas vezes, e os dois slots são
     * instantes distintos, distinguíveis pelo offset no ISO.
     */
    expect(labels(NEW_YORK, slots)).toEqual([
      "2026-11-01T00:00:00-04:00",
      "2026-11-01T01:00:00-04:00",
      "2026-11-01T01:00:00-05:00",
      "2026-11-01T02:00:00-05:00",
      "2026-11-01T03:00:00-05:00",
      "2026-11-01T04:00:00-05:00",
      "2026-11-01T05:00:00-05:00",
    ]);
    expectContiguous(slots);
    expect(new Set(slots.map((slot) => slot.startsAt.getTime())).size).toBe(slots.length);
  });

  it("cobra a mesma duração real em todos os slots do dia da transição", () => {
    const slots = grid(
      NEW_YORK,
      { year: 2026, month: 11, day: 1 },
      window({ opensAtMinutes: 0, closesAtMinutes: 6 * 60 }),
    );

    for (const slot of slots) {
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(60 * 60_000);
      expect(slot.priceInCents).toBe(12_000);
    }
  });

  it("devolve grade vazia quando a janela é menor que um slot", () => {
    const slots = grid(
      SAO_PAULO,
      { year: 2026, month: 9, day: 1 },
      window({ closesAtMinutes: 9 * 60 + 30 }),
    );

    expect(slots).toEqual([]);
  });

  it("recusa slotMinutes não positivo em vez de girar para sempre", () => {
    expect(() =>
      grid(SAO_PAULO, { year: 2026, month: 9, day: 1 }, window({ slotMinutes: 0 })),
    ).toThrow(/slotMinutes/);
  });
});

/** Fim de um slot é o começo do próximo: nenhum instante da janela fica de fora. */
function expectContiguous(slots: { startsAt: Date; endsAt: Date }[]): void {
  for (const [index, slot] of slots.entries()) {
    if (index === 0) continue;

    expect(slot.startsAt.getTime()).toBe(slots[index - 1]?.endsAt.getTime());
  }
}
