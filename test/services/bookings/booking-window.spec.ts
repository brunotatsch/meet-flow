import { describe, expect, it } from "vitest";
import type { OpeningPeriod } from "@services/bookings/domain/availability";
import { slotsCoveredBy } from "@services/bookings/domain/booking-window";
import { OutsideBusinessHoursError, SlotNotAlignedError } from "@services/bookings/domain/errors";
import { bookingTotalInCents, slotPriceInCents } from "@services/bookings/domain/slot";

/** Sala aberta das 09:00 às 12:00 em São Paulo (UTC-3), grade de 60 minutos. */
const PERIOD: OpeningPeriod = {
  opensAt: new Date("2026-09-01T12:00:00.000Z"),
  closesAt: new Date("2026-09-01T15:00:00.000Z"),
};

function at(time: string): Date {
  return new Date(`2026-09-01T${time}:00.000Z`);
}

describe("slotsCoveredBy", () => {
  it("conta os slots de um período que casa com a grade", () => {
    expect(slotsCoveredBy({ startsAt: at("12:00"), endsAt: at("13:00") }, PERIOD, 60)).toBe(1);
    expect(slotsCoveredBy({ startsAt: at("13:00"), endsAt: at("15:00") }, PERIOD, 60)).toBe(2);
  });

  it("aceita o período colado na abertura e no fechamento", () => {
    expect(slotsCoveredBy({ startsAt: at("12:00"), endsAt: at("15:00") }, PERIOD, 60)).toBe(3);
  });

  it("recusa período que começa antes da abertura", () => {
    expect(() =>
      slotsCoveredBy({ startsAt: at("11:00"), endsAt: at("12:00") }, PERIOD, 60),
    ).toThrow(OutsideBusinessHoursError);
  });

  it("recusa período que passa do fechamento", () => {
    expect(() =>
      slotsCoveredBy({ startsAt: at("14:00"), endsAt: at("16:00") }, PERIOD, 60),
    ).toThrow(OutsideBusinessHoursError);
  });

  /**
   * 12:30 está dentro da janela, mas não é uma borda da grade: aceitar bloquearia
   * dois slots ofertados de uma hora e cobraria o preço de um.
   */
  it("recusa início que não cai numa borda da grade", () => {
    expect(() =>
      slotsCoveredBy({ startsAt: at("12:30"), endsAt: at("13:30") }, PERIOD, 60),
    ).toThrow(SlotNotAlignedError);
  });

  it("recusa duração que não é múltipla do slot", () => {
    expect(() =>
      slotsCoveredBy({ startsAt: at("12:00"), endsAt: at("12:30") }, PERIOD, 60),
    ).toThrow(SlotNotAlignedError);
  });

  it("recusa período invertido ou de duração zero", () => {
    expect(() =>
      slotsCoveredBy({ startsAt: at("13:00"), endsAt: at("13:00") }, PERIOD, 60),
    ).toThrow(SlotNotAlignedError);
  });

  it("recusa grade inválida em vez de dividir por zero", () => {
    expect(() => slotsCoveredBy({ startsAt: at("12:00"), endsAt: at("13:00") }, PERIOD, 0)).toThrow(
      SlotNotAlignedError,
    );
  });

  it("acompanha uma grade de 30 minutos", () => {
    expect(slotsCoveredBy({ startsAt: at("12:30"), endsAt: at("13:30") }, PERIOD, 30)).toBe(2);
  });
});

describe("bookingTotalInCents", () => {
  it("multiplica o preço do slot pela quantidade de slots", () => {
    expect(bookingTotalInCents(12_000, 60, 2)).toBe(24_000);
    expect(bookingTotalInCents(12_000, 30, 3)).toBe(18_000);
  });

  /**
   * Com tarifa que não divide certo, somar slots e cobrar a duração inteira divergem.
   * Vale o que a grade mostrou: dois slots de 17, não uma hora de 33.
   */
  it("cobra a soma dos slots da grade, não o preço da duração inteira", () => {
    expect(slotPriceInCents(33, 30)).toBe(17);
    expect(bookingTotalInCents(33, 30, 2)).toBe(34);
    expect(slotPriceInCents(33, 60)).toBe(33);
  });

  it("mantém zero para sala gratuita", () => {
    expect(bookingTotalInCents(0, 60, 4)).toBe(0);
  });
});
