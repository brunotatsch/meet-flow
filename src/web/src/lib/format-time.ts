/**
 * Formata um instante no fuso IANA informado, nunca no fuso do navegador.
 *
 * O offset já embutido no ISO (`-03:00`) é suficiente para o `Date` calcular o
 * instante certo, mas exibir a hora exige dizer ao `Intl` em qual fuso desenhar o
 * relógio - sem isso, o navegador formata no fuso local de quem está olhando a
 * tela, que quase nunca é o da sala.
 */
export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function formatDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

export function formatDurationMinutes(startsAt: string, endsAt: string): string {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}min`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h${remainder}min`;
}

/**
 * Minutos desde a meia-noite **no fuso informado**, para posicionar um instante
 * numa linha do tempo de um dia (a agenda diária do admin, MVP-12).
 */
export function minutesFromMidnightInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(iso));

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}

/** Data de calendário (`YYYY-MM-DD`) de um instante **no fuso informado**, comparável como string. */
export function calendarDateStringInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

/**
 * Data de hoje (`YYYY-MM-DD`) no fuso **local do navegador**, para popular
 * seletores de data com um valor inicial razoável antes de qualquer dado de
 * empresa/sala ter carregado.
 *
 * Deliberadamente não usa `new Date().toISOString()`: `toISOString` sempre
 * devolve a data em UTC, e alguém em São Paulo (UTC-3) às 22h de um dia já veria
 * o seletor abrir no dia seguinte. `getFullYear`/`getMonth`/`getDate` leem os
 * componentes no fuso do dispositivo, que é o que a pessoa preenchendo o
 * formulário está de fato vendo no relógio dela.
 */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Desloca uma data de calendário (`YYYY-MM-DD`) em `days` dias, sem fuso envolvido. */
export function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}
