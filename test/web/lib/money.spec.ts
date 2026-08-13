import { describe, expect, it } from "vitest";
import { centsToReaisInput, reaisToCents } from "@web/lib/money";

describe("reaisToCents", () => {
  it("converte um valor exato", () => {
    expect(reaisToCents("120.00")).toBe(12_000);
  });

  it("converte um valor sem casas decimais", () => {
    expect(reaisToCents("120")).toBe(12_000);
  });

  it("não sofre o erro clássico de ponto flutuante em 19.99", () => {
    // Number("19.99") * 100 === 1998.9999999999998 em JS.
    expect(reaisToCents("19.99")).toBe(1_999);
  });

  it("completa casa decimal faltante", () => {
    expect(reaisToCents("10.5")).toBe(1_050);
  });

  it("trata string vazia como zero", () => {
    expect(reaisToCents("")).toBe(0);
  });

  it("trunca casas decimais além da segunda", () => {
    expect(reaisToCents("10.999")).toBe(1_099);
  });

  it("converte valores negativos", () => {
    expect(reaisToCents("-5.50")).toBe(-550);
  });
});

describe("centsToReaisInput", () => {
  it("converte centavos para o valor que popula o input", () => {
    expect(centsToReaisInput(12_000)).toBe("120.00");
  });

  it("preenche o zero à esquerda dos centavos", () => {
    expect(centsToReaisInput(105)).toBe("1.05");
  });

  it("converte zero", () => {
    expect(centsToReaisInput(0)).toBe("0.00");
  });

  it("é o inverso de reaisToCents para uma rodada completa", () => {
    for (const value of ["120.00", "19.99", "0.01", "1050.30"]) {
      expect(centsToReaisInput(reaisToCents(value))).toBe(value);
    }
  });
});
