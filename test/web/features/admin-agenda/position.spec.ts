import { describe, expect, it } from "vitest";
import { bookingBlockPosition, MINUTES_IN_DAY } from "@web/features/admin-agenda/lib/position";

const TZ = "America/Sao_Paulo";
const DATE = "2030-06-04";

describe("bookingBlockPosition", () => {
  it("posiciona uma reserva inteira dentro do dia", () => {
    const position = bookingBlockPosition(
      "2030-06-04T09:00:00-03:00",
      "2030-06-04T10:30:00-03:00",
      DATE,
      TZ,
    );

    expect(position).toEqual({ startMinutes: 540, endMinutes: 630 });
  });

  it("recorta no início do dia uma reserva que começou no dia anterior", () => {
    const position = bookingBlockPosition(
      "2030-06-03T22:00:00-03:00",
      "2030-06-04T02:00:00-03:00",
      DATE,
      TZ,
    );

    expect(position).toEqual({ startMinutes: 0, endMinutes: 120 });
  });

  it("recorta no fim do dia uma reserva que termina no dia seguinte", () => {
    const position = bookingBlockPosition(
      "2030-06-04T23:00:00-03:00",
      "2030-06-05T01:00:00-03:00",
      DATE,
      TZ,
    );

    expect(position).toEqual({ startMinutes: 1_380, endMinutes: MINUTES_IN_DAY });
  });

  it("uma reserva que termina exatamente à meia-noite não vaza 1 minuto pro dia seguinte", () => {
    const position = bookingBlockPosition(
      "2030-06-04T23:00:00-03:00",
      "2030-06-05T00:00:00-03:00",
      DATE,
      TZ,
    );

    expect(position.endMinutes).toBe(MINUTES_IN_DAY);
  });

  it("calcula no fuso pedido, não no offset embutido no ISO", () => {
    // 09:00-10:00 em São Paulo é 13:00-14:00 em Londres (BST, UTC+1) em junho.
    const position = bookingBlockPosition(
      "2030-06-04T09:00:00-03:00",
      "2030-06-04T10:00:00-03:00",
      DATE,
      "Europe/London",
    );

    expect(position).toEqual({ startMinutes: 780, endMinutes: 840 });
  });
});
