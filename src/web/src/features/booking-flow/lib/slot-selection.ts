import type { AvailabilitySlot } from "@shared/schemas/booking.schema";

/**
 * Aplica o clique em um slot à seleção atual, mantendo a invariante de que a
 * seleção é sempre um intervalo contíguo de slots disponíveis - é o que permite
 * reservar vários slots seguidos como uma reserva só (passo 2 do wizard).
 *
 * Comparação por referência (`===`), não por `startsAt`: os slots vêm sempre do
 * mesmo array retornado pela API (`allSlots`), nunca recriados por quem chama.
 *
 * Regras:
 * - Slot ocupado: clique não faz nada.
 * - Nenhuma seleção ainda: clique começa uma seleção de um slot.
 * - Slot adjacente a uma das pontas da seleção: estende a seleção.
 * - Slot não adjacente: recomeça a seleção só nele.
 * - Slot já selecionado, na ponta: encolhe a seleção removendo essa ponta.
 * - Slot já selecionado, no meio: recomeça a seleção só nele - dividir o meio de
 *   um intervalo em dois pedaços não tem uma única resposta óbvia de UX, e
 *   recomeçar é o comportamento mais previsível.
 */
export function toggleSlotSelection(
  allSlots: AvailabilitySlot[],
  selected: AvailabilitySlot[],
  clicked: AvailabilitySlot,
): AvailabilitySlot[] {
  if (!clicked.available) return selected;

  if (selected.length === 0) return [clicked];

  const isSelected = selected.includes(clicked);

  if (isSelected) {
    if (selected.length === 1) return [];
    if (selected[0] === clicked) return selected.slice(1);
    if (selected[selected.length - 1] === clicked) return selected.slice(0, -1);
    return [clicked];
  }

  const clickedIndex = allSlots.indexOf(clicked);
  const firstIndex = allSlots.indexOf(selected[0]!);
  const lastIndex = allSlots.indexOf(selected[selected.length - 1]!);

  if (clickedIndex === lastIndex + 1) return [...selected, clicked];
  if (clickedIndex === firstIndex - 1) return [clicked, ...selected];

  return [clicked];
}

export function totalPriceInCents(selected: AvailabilitySlot[]): number {
  return selected.reduce((sum, slot) => sum + slot.priceInCents, 0);
}
