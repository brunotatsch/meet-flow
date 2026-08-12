import type { OpeningPeriod } from "./availability";
import { OutsideBusinessHoursError, SlotNotAlignedError } from "./errors";

const MINUTE_IN_MS = 60_000;

export interface RequestedPeriod {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Confere que o período pedido é exatamente uma sequência de slots da grade do dia
 * e devolve quantos slots ele ocupa.
 *
 * A grade que o cliente viu no passo 2 é montada por `buildDayAvailability`, que
 * avança em tempo real a partir da abertura. Esta função reconstrói o mesmo critério
 * sem materializar a grade: basta que o início caia em uma borda (`(startsAt -
 * opensAt)` múltiplo do slot), que a duração seja múltipla do slot e que o período
 * inteiro caiba na janela.
 *
 * Sem o alinhamento, uma requisição direta à API reservaria 09:15-10:15 numa grade
 * de hora cheia: o horário nunca foi ofertado, some da grade dois slots em vez de um
 * e o total cobrado deixa de corresponder ao que a grade mostra.
 *
 * O número de slots devolvido é o que precifica a reserva, por isso a função calcula
 * em vez de só validar: quem valida a grade é quem sabe quantos slots ela cobre.
 */
export function slotsCoveredBy(
  requested: RequestedPeriod,
  period: OpeningPeriod,
  slotMinutes: number,
): number {
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
    throw new SlotNotAlignedError("A sala não tem uma grade de horários válida para este dia.");
  }

  const slotDurationMs = slotMinutes * MINUTE_IN_MS;
  const startsAt = requested.startsAt.getTime();
  const endsAt = requested.endsAt.getTime();
  const opensAt = period.opensAt.getTime();
  const closesAt = period.closesAt.getTime();

  if (startsAt < opensAt || endsAt > closesAt) {
    throw new OutsideBusinessHoursError(
      "O período pedido está fora do horário de funcionamento da sala neste dia.",
    );
  }

  if ((startsAt - opensAt) % slotDurationMs !== 0) {
    throw new SlotNotAlignedError(
      `O início da reserva precisa coincidir com um horário ofertado na grade de ${slotMinutes} minutos.`,
    );
  }

  const durationMs = endsAt - startsAt;

  if (durationMs <= 0 || durationMs % slotDurationMs !== 0) {
    throw new SlotNotAlignedError(
      `A duração da reserva precisa ser múltipla de ${slotMinutes} minutos.`,
    );
  }

  return durationMs / slotDurationMs;
}
