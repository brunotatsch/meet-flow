export const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Converte um valor em reais (o que o formulário do admin edita) para centavos
 * (o que a API grava), sem passar por ponto flutuante.
 *
 * `Number(reais) * 100` quebra para valores como `19.99` (`1998.9999999999998`
 * em JS). Aqui a string é partida em parte inteira e fracionária *antes* de
 * virar número, e as duas viram inteiros somados - `19 * 100 + 99`, exato.
 *
 * Entrada vem de `<input type="number">`, cujo `value` no DOM é sempre
 * ponto-decimal (`.`), independente do locale de exibição do navegador.
 */
export function reaisToCents(reais: string): number {
  const trimmed = reais.trim();
  if (!trimmed) return 0;

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");

  const whole = Number(wholePart) || 0;
  const fraction = Number((fractionPart + "00").slice(0, 2)) || 0;
  const cents = whole * 100 + fraction;

  return negative ? -cents : cents;
}

/** Inverso de `reaisToCents`: centavos -> string para popular o `<input type="number">` ao editar. */
export function centsToReaisInput(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;

  return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}
