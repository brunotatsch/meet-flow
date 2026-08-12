/**
 * Conversão entre horário de parede (o que está escrito na agenda da sala) e
 * instante absoluto, usando só o `Intl` da plataforma.
 *
 * Nenhuma biblioteca de data entra aqui de propósito: o que o motor de
 * disponibilidade precisa é o banco de fusos do ICU, que já vem com o runtime, e
 * três operações em cima dele. Uma dependência extra traria muito mais superfície
 * do que o problema pede e ainda assim delegaria ao mesmo ICU.
 *
 * O ponto delicado é que "09:00 na sala" não é um instante: só vira um depois de
 * saber o offset do fuso **naquele dia**, e o offset muda com o horário de verão.
 * Por isso toda conversão passa por `zonedTimeToInstant`, nunca por
 * `new Date("2026-03-10T09:00")`, que o runtime interpretaria no fuso do servidor.
 */

const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;

/** Data de calendário já no fuso da empresa, sem qualquer noção de instante. */
export interface CalendarDate {
  year: number;
  /** 1 = janeiro ... 12 = dezembro. */
  month: number;
  day: number;
}

interface ZonedParts extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
}

/**
 * `Intl.DateTimeFormat` é caro de construir e o motor formata dezenas de slots
 * por requisição, sempre no mesmo punhado de fusos. O cache é seguro porque a
 * instância é imutável.
 */
const formatterByTimeZone = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterByTimeZone.get(timeZone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  formatterByTimeZone.set(timeZone, formatter);

  return formatter;
}

function partsAt(timeZone: string, instant: Date): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);

    if (!part) {
      throw new Error(`Intl não devolveu a parte "${type}" para o fuso "${timeZone}".`);
    }

    return Number(part.value);
  };

  const hour = read("hour");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    /** Versões antigas do ICU formatam meia-noite como `24` mantendo a data correta. */
    hour: hour === 24 ? 0 : hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * Offset do fuso, em minutos, **no instante dado** (positivo a leste de Greenwich).
 *
 * Formata o instante no fuso alvo e relê as partes como se fossem UTC: a diferença
 * entre as duas leituras é exatamente o offset vigente ali.
 */
export function timeZoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = partsAt(timeZone, instant);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  /**
   * O arredondamento absorve os milissegundos do instante, que `partsAt` não
   * carrega. Todos os fusos IANA modernos têm offset em minutos inteiros.
   */
  return Math.round((asIfUtc - instant.getTime()) / MINUTE_IN_MS);
}

/**
 * Converte um horário de parede (`date` + minutos desde a meia-noite local) no
 * instante correspondente do fuso.
 *
 * O offset depende do instante que estamos justamente tentando descobrir, então não
 * dá para converter em uma passada. O caminho usado aqui é o mesmo do `Temporal`:
 * amostrar o offset um dia antes e um dia depois - longe o bastante de qualquer
 * transição -, montar um instante candidato com cada um e ficar com os que se
 * confirmam, isto é, aqueles cujo offset real coincide com o que os gerou.
 *
 * O número de candidatos válidos classifica o horário de parede:
 *
 * - **um** candidato: dia comum, nada a decidir;
 * - **dois** candidatos: hora ambígua (o relógio atrasou e 01:30 aconteceu duas
 *   vezes); fica a primeira ocorrência, ainda no horário de verão;
 * - **nenhum**: hora inexistente (o relógio adiantou e 02:30 foi pulada); aplica-se
 *   o offset anterior à transição, o que empurra o instante para frente - uma sala
 *   que "abre às 2" no dia da virada abre quando o relógio volta a existir, 03:00,
 *   e não uma hora antes.
 *
 * A alternativa ingênua (duas passadas, corrigindo o offset uma vez) resolve o dia
 * comum, mas na hora inexistente joga o instante para **trás** da transição, fazendo
 * a sala abrir antes do horário cadastrado.
 */
export function zonedTimeToInstant(
  timeZone: string,
  date: CalendarDate,
  minutesFromMidnight: number,
): Date {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, 0, minutesFromMidnight);

  const offsetBefore = timeZoneOffsetMinutes(timeZone, new Date(wallClockAsUtc - DAY_IN_MS));
  const offsetAfter = timeZoneOffsetMinutes(timeZone, new Date(wallClockAsUtc + DAY_IN_MS));

  const sampledOffsets =
    offsetBefore === offsetAfter ? [offsetBefore] : [offsetBefore, offsetAfter];
  const confirmed: number[] = [];

  for (const offset of sampledOffsets) {
    const candidate = wallClockAsUtc - offset * MINUTE_IN_MS;

    if (timeZoneOffsetMinutes(timeZone, new Date(candidate)) === offset) {
      confirmed.push(candidate);
    }
  }

  if (confirmed.length === 0) {
    return new Date(wallClockAsUtc - offsetBefore * MINUTE_IN_MS);
  }

  return new Date(Math.min(...confirmed));
}

/**
 * Data de calendário em que o instante cai **no fuso da empresa**.
 *
 * É o que decide de qual dia da semana a reserva puxa a janela de funcionamento.
 * Ler o dia com `getUTCDate()` erraria toda reserva noturna: 21:00 de segunda em São
 * Paulo já é terça em UTC, e a sala seria checada contra a agenda do dia seguinte.
 */
export function calendarDateAt(timeZone: string, instant: Date): CalendarDate {
  const { year, month, day } = partsAt(timeZone, instant);

  return { year, month, day };
}

/**
 * Serializa o instante em ISO 8601 **com o offset do fuso da empresa**, nunca em UTC.
 *
 * O offset explícito é o que permite ao cliente exibir a grade no fuso da sala sem
 * depender do fuso do navegador, e é o que torna visível, no próprio payload, a
 * mudança de `-05:00` para `-04:00` em um dia de transição.
 */
export function formatIsoWithOffset(instant: Date, timeZone: string): string {
  const parts = partsAt(timeZone, instant);
  const offsetMinutes = timeZoneOffsetMinutes(timeZone, instant);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);

  const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
  const time = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;

  return `${date}T${time}${offset}`;
}

/**
 * Dia da semana (0 = domingo ... 6 = sábado) de uma data de calendário.
 *
 * Não depende de fuso: a data já chega expressa no fuso da empresa, e a mesma data
 * de calendário cai no mesmo dia da semana em qualquer lugar do mundo.
 */
export function weekdayOf(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * Interpreta `YYYY-MM-DD` como data de calendário.
 *
 * Rejeita data que não existe (`2026-02-30`) comparando com o que o calendário
 * devolve: `Date.UTC` normaliza silenciosamente o excedente para o mês seguinte, e
 * aceitar isso faria o motor responder a disponibilidade de um dia que o cliente
 * não pediu.
 */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const normalized = new Date(Date.UTC(year, month - 1, day));

  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
