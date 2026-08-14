import { calendarDateStringInZone, minutesFromMidnightInZone } from "@web/lib/format-time";

export const MINUTES_IN_DAY = 24 * 60;

export interface BlockPosition {
  /** Minutos desde a meia-noite do dia consultado, sempre em `[0, 1440]`. */
  startMinutes: number;
  endMinutes: number;
}

/**
 * Posição de uma reserva na linha do tempo do dia consultado, em minutos desde a
 * meia-noite - a linha do tempo em si não sabe nada de fuso, só de minutos.
 *
 * Uma reserva que cruza a virada do dia (começou ontem, ou termina amanhã) é
 * recortada nas bordas do dia consultado: ela aparece na agenda de cada dia que
 * toca, mas só a fatia daquele dia, igual a qualquer calendário de dia único.
 */
export function bookingBlockPosition(
  startsAt: string,
  endsAt: string,
  date: string,
  timeZone: string,
): BlockPosition {
  const startDate = calendarDateStringInZone(startsAt, timeZone);
  const endDate = calendarDateStringInZone(endsAt, timeZone);

  const startMinutes = startDate < date ? 0 : minutesFromMidnightInZone(startsAt, timeZone);
  const endMinutes = endDate > date ? MINUTES_IN_DAY : minutesFromMidnightInZone(endsAt, timeZone);

  return { startMinutes, endMinutes };
}
