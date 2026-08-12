/** Faixa de horário ofertável de uma sala, já resolvida em instantes absolutos. */
export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /** `false` quando o slot colide, ainda que parcialmente, com uma reserva ativa. */
  available: boolean;
  priceInCents: number;
}

/** Período já reservado que o motor precisa subtrair da grade. */
export interface BookedPeriod {
  startsAt: Date;
  endsAt: Date;
}

const MINUTES_IN_HOUR = 60;

/**
 * Preço do slot a partir da tarifa horária da sala, proporcional à duração.
 *
 * O arredondamento é **meio para cima**, em aritmética inteira: `hourlyRateInCents`
 * e `slotMinutes` são inteiros, então `taxa * minutos` também é, e somar 30 antes de
 * dividir por 60 arredonda sem nunca passar por ponto flutuante. Um slot de 30 min a
 * R$ 100,00/h custa 5000; a 33 centavos/h custa 17, não 16,5.
 *
 * Escolher meio para cima (e não `floor`, nem meio para par) é deliberado: é a regra
 * que qualquer pessoa reproduz de cabeça ao conferir a conta, e o meio centavo a mais
 * fica com quem aluga a sala, não com a casa de arredondamento.
 */
export function slotPriceInCents(hourlyRateInCents: number, slotMinutes: number): number {
  return Math.floor((hourlyRateInCents * slotMinutes + MINUTES_IN_HOUR / 2) / MINUTES_IN_HOUR);
}

/**
 * Total da reserva: a **soma dos slots ocupados**, não o preço da duração inteira.
 *
 * A diferença aparece quando o preço do slot não é exato. Com tarifa de 33 centavos
 * por hora e grade de 30 minutos, cada slot custa 17 (arredondado meio para cima) e
 * dois slots somam 34, enquanto cobrar a hora cheia daria 33. O cliente escolheu dois
 * slots de 17 na grade do passo 2, então é 34 que ele espera ver na confirmação -
 * cobrar diferente do que a grade mostrou é o tipo de discrepância que vira disputa.
 */
export function bookingTotalInCents(
  hourlyRateInCents: number,
  slotMinutes: number,
  slotCount: number,
): number {
  return slotPriceInCents(hourlyRateInCents, slotMinutes) * slotCount;
}

/**
 * Colisão em intervalo semiaberto `[startsAt, endsAt)`, a mesma semântica do
 * `tstzrange(starts_at, ends_at, '[)')` que a constraint `bookings_no_overlap` usa
 * no banco. Encostar não é colidir: a reserva que termina 10:00 libera o slot que
 * começa 10:00.
 */
export function overlaps(slot: { startsAt: Date; endsAt: Date }, period: BookedPeriod): boolean {
  return (
    period.startsAt.getTime() < slot.endsAt.getTime() &&
    period.endsAt.getTime() > slot.startsAt.getTime()
  );
}
