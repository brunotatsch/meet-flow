import { overlaps, slotPriceInCents, type BookedPeriod, type Slot } from "./slot";
import { zonedTimeToInstant, type CalendarDate } from "./time-zone";

const MINUTE_IN_MS = 60_000;

/** Janela de funcionamento de um dia, em minutos desde a meia-noite local. */
export interface OpeningWindow {
  opensAtMinutes: number;
  closesAtMinutes: number;
  slotMinutes: number;
}

/** A mesma janela já resolvida em instantes absolutos. */
export interface OpeningPeriod {
  opensAt: Date;
  closesAt: Date;
}

export interface DayAvailabilityInput {
  period: OpeningPeriod;
  slotMinutes: number;
  hourlyRateInCents: number;
  bookedPeriods: BookedPeriod[];
  /** Instante lido do `Clock`; slots que já começaram somem da grade. */
  now: Date;
}

/**
 * Resolve a janela de funcionamento do dia em instantes absolutos.
 *
 * Abertura e fechamento são convertidos separadamente, cada um com o offset
 * vigente no seu próprio momento. É isso que faz um dia de transição de horário de
 * verão render 23 ou 25 horas reais em vez de 24, que é justamente o que o motor
 * precisa saber para não inventar nem perder slots.
 */
export function resolveOpeningPeriod(
  timeZone: string,
  date: CalendarDate,
  window: OpeningWindow,
): OpeningPeriod {
  return {
    opensAt: zonedTimeToInstant(timeZone, date, window.opensAtMinutes),
    closesAt: zonedTimeToInstant(timeZone, date, window.closesAtMinutes),
  };
}

/**
 * Monta a grade do dia e subtrai dela as reservas ativas.
 *
 * **A grade avança em tempo real, não em horário de parede.** Cada slot dura
 * exatamente `slotMinutes` de relógio absoluto, e o próximo começa quando o
 * anterior termina, até não caber mais um slot inteiro antes do fechamento. A
 * alternativa - gerar as bordas em horário de parede (09:00, 10:00, 11:00...) e
 * converter cada uma para instante - quebra nos dois dias de transição:
 *
 * - quando o relógio adianta, o horário de parede pulado não existe e viraria um
 *   slot de duração zero, ou pior, um slot cobrando uma hora por nada;
 * - quando o relógio atrasa, a hora repetida geraria dois slots com o mesmo rótulo
 *   e, se a conversão escolhesse sempre a primeira ocorrência, dois slots apontando
 *   para o **mesmo** instante - o "duplicar" que o motor não pode fazer.
 *
 * Avançando em tempo real, o dia da virada simplesmente tem um slot a menos (ou a
 * mais), todos com duração real igual à cobrada, e nenhum instante coberto duas
 * vezes. Os rótulos de parede acompanham: em Nova York, no dia em que o relógio
 * adianta, a grade vai de 01:00 direto para 03:00, sem buraco no tempo real.
 */
export function buildDayAvailability(input: DayAvailabilityInput): Slot[] {
  const slotDurationMs = input.slotMinutes * MINUTE_IN_MS;

  if (slotDurationMs <= 0) {
    throw new Error("slotMinutes precisa ser positivo para montar a grade do dia.");
  }

  const priceInCents = slotPriceInCents(input.hourlyRateInCents, input.slotMinutes);
  const closesAt = input.period.closesAt.getTime();
  const now = input.now.getTime();
  const slots: Slot[] = [];

  for (
    let startsAt = input.period.opensAt.getTime();
    startsAt + slotDurationMs <= closesAt;
    startsAt += slotDurationMs
  ) {
    /**
     * Slot que já começou não é ofertável, nem como indisponível: o cliente não
     * pode reservar o passado, e mostrá-lo riscado só polui a grade. O corte é
     * `<=` porque um slot que começa exatamente agora já começou.
     */
    if (startsAt <= now) {
      continue;
    }

    const slot = { startsAt: new Date(startsAt), endsAt: new Date(startsAt + slotDurationMs) };

    slots.push({
      ...slot,
      available: !input.bookedPeriods.some((period) => overlaps(slot, period)),
      priceInCents,
    });
  }

  return slots;
}
