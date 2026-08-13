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
