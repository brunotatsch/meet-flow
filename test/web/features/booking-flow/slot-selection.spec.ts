import { describe, expect, it } from "vitest";
import type { AvailabilitySlot } from "@shared/schemas/booking.schema";
import { toggleSlotSelection, totalPriceInCents } from "@web/features/booking-flow/lib/slot-selection";

function slot(hour: number, available = true): AvailabilitySlot {
  const start = String(hour).padStart(2, "0");
  const end = String(hour + 1).padStart(2, "0");
  return {
    startsAt: `2030-06-04T${start}:00:00-03:00`,
    endsAt: `2030-06-04T${end}:00:00-03:00`,
    available,
    priceInCents: 10_000,
  };
}

describe("toggleSlotSelection", () => {
  it("ignora clique em slot ocupado", () => {
    const occupied = slot(10, false);
    expect(toggleSlotSelection([occupied], [], occupied)).toEqual([]);
  });

  it("começa a seleção com um clique em slot livre", () => {
    const nine = slot(9);
    expect(toggleSlotSelection([nine], [], nine)).toEqual([nine]);
  });

  it("estende a seleção para um slot livre logo depois", () => {
    const [nine, ten] = [slot(9), slot(10)];
    const all = [nine, ten];

    expect(toggleSlotSelection(all, [nine], ten)).toEqual([nine, ten]);
  });

  it("estende a seleção para um slot livre logo antes", () => {
    const [nine, ten] = [slot(9), slot(10)];
    const all = [nine, ten];

    expect(toggleSlotSelection(all, [ten], nine)).toEqual([nine, ten]);
  });

  it("recomeça a seleção ao clicar num slot não adjacente", () => {
    const [nine, ten, eleven] = [slot(9), slot(10), slot(11)];
    const all = [nine, ten, eleven];

    expect(toggleSlotSelection(all, [nine], eleven)).toEqual([eleven]);
  });

  it("não estende para um slot adjacente que está ocupado", () => {
    const nine = slot(9);
    const tenOccupied = slot(10, false);
    const all = [nine, tenOccupied];

    expect(toggleSlotSelection(all, [nine], tenOccupied)).toEqual([nine]);
  });

  it("encolhe a seleção ao clicar de novo na última ponta", () => {
    const [nine, ten, eleven] = [slot(9), slot(10), slot(11)];
    const all = [nine, ten, eleven];
    const selected = [nine, ten, eleven];

    expect(toggleSlotSelection(all, selected, eleven)).toEqual([nine, ten]);
  });

  it("encolhe a seleção ao clicar de novo na primeira ponta", () => {
    const [nine, ten, eleven] = [slot(9), slot(10), slot(11)];
    const all = [nine, ten, eleven];
    const selected = [nine, ten, eleven];

    expect(toggleSlotSelection(all, selected, nine)).toEqual([ten, eleven]);
  });

  it("limpa a seleção ao clicar de novo no único slot selecionado", () => {
    const nine = slot(9);
    expect(toggleSlotSelection([nine], [nine], nine)).toEqual([]);
  });

  it("recomeça a seleção ao clicar num slot do meio de um intervalo", () => {
    const [nine, ten, eleven] = [slot(9), slot(10), slot(11)];
    const all = [nine, ten, eleven];
    const selected = [nine, ten, eleven];

    expect(toggleSlotSelection(all, selected, ten)).toEqual([ten]);
  });
});

describe("totalPriceInCents", () => {
  it("soma o preço de cada slot selecionado", () => {
    expect(totalPriceInCents([slot(9), slot(10)])).toBe(20_000);
  });

  it("devolve zero para seleção vazia", () => {
    expect(totalPriceInCents([])).toBe(0);
  });
});
