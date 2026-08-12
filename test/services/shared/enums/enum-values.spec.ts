import { describe, expect, it } from "vitest";
import { enumValues } from "@shared/enums/enum-values";

describe("enumValues", () => {
  it("extrai os valores de um enum de strings na ordem de declaração", () => {
    const Status = { PENDING: "pending", DONE: "done" } as const;

    expect(enumValues(Status)).toEqual(["pending", "done"]);
  });

  it("extrai os valores de um enum numérico", () => {
    const Weekday = { SUNDAY: 0, MONDAY: 1 } as const;

    expect(enumValues(Weekday)).toEqual([0, 1]);
  });

  it("lança erro quando o enum não tem nenhum valor", () => {
    expect(() => enumValues({})).toThrow(/ao menos um valor/);
  });
});
