/** SQLSTATE de violação de unique. */
export const UNIQUE_VIOLATION = "23505";
/** SQLSTATE de violação de constraint de exclusão (usado por `bookings_no_overlap`). */
export const EXCLUSION_VIOLATION = "23P01";
/** SQLSTATE de violação de check. */
export const CHECK_VIOLATION = "23514";
/** SQLSTATE de violação de chave estrangeira. */
export const FOREIGN_KEY_VIOLATION = "23503";
/**
 * SQLSTATE genérico de dado inválido.
 *
 * Aparece antes das `CHECK` quando o valor não chega nem a ser armazenável: um
 * `INSERT` em `bookings` com `ends_at < starts_at` morre aqui, no construtor de
 * `tstzrange` da coluna gerada `period`, e nunca alcança `bookings_period_valid`.
 */
export const DATA_EXCEPTION = "22000";

export interface PostgresFailure {
  sqlState: string;
  /** Nome da constraint violada, quando o Postgres o informa. */
  constraint: string | null;
}

const UNAVAILABLE_DRIVER_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ERR_POSTGRES_IDLE_TIMEOUT",
  "ERR_POSTGRES_LIFETIME_TIMEOUT",
]);

const UNAVAILABLE_SQL_STATES = new Set([
  "28P01", // senha inválida: configuração do serviço, não erro do cliente HTTP
  "28000", // autorização inválida
  "42P01", // relation ausente: migrations não aplicadas
  "42703", // coluna ausente: schema desatualizado
  "42883", // função ausente: migration/extensão desatualizada
  "53300", // conexões esgotadas
  "57P01", // admin shutdown
  "57P02", // crash shutdown
  "57P03", // cannot connect now
]);

/**
 * Extrai o erro do Postgres de dentro do que a stack embrulha.
 *
 * Duas particularidades tornam este helper necessário em todo ponto que precise
 * traduzir violação de constraint em resposta HTTP:
 *
 * 1. o Drizzle embrulha o erro do driver em `DrizzleQueryError`, então o erro
 *    original só aparece descendo a cadeia de `cause`;
 * 2. o driver do Bun põe o SQLSTATE em `errno` e reserva `code` para o rótulo
 *    genérico `ERR_POSTGRES_SERVER_ERROR`.
 *
 * Devolve `null` quando o erro não veio do Postgres, e nesse caso quem chamou
 * deve deixá-lo propagar em vez de tratá-lo como erro de negócio.
 */
export function findPostgresFailure(error: unknown): PostgresFailure | null {
  let current = error;

  while (current instanceof Error) {
    const { errno, constraint } = current as unknown as {
      errno?: unknown;
      constraint?: unknown;
    };

    if (typeof errno === "string") {
      return {
        sqlState: errno,
        constraint: typeof constraint === "string" ? constraint : null,
      };
    }

    current = current.cause;
  }

  return null;
}

/**
 * Reconhece falhas de infraestrutura ou schema desatualizado ao longo da
 * cadeia de `cause`.
 *
 * O Bun usa `code=ERR_POSTGRES_CONNECTION_*` antes de existir uma sessão e
 * `errno=<SQLSTATE>` quando o servidor chegou a responder. Manter essa
 * classificação central evita que rate limit, autenticação e rotas de negócio
 * apresentem a indisponibilidade do banco como um 500 diferente em cada ponto.
 */
export function findPostgresUnavailableCode(error: unknown): string | null {
  let current = error;
  const visited = new Set<Error>();

  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);

    const { code, errno } = current as Error & {
      code?: unknown;
      errno?: unknown;
    };

    for (const candidate of [errno, code]) {
      if (typeof candidate !== "string") continue;

      if (
        candidate.startsWith("08") ||
        candidate.startsWith("ERR_POSTGRES_CONNECTION_") ||
        UNAVAILABLE_DRIVER_CODES.has(candidate) ||
        UNAVAILABLE_SQL_STATES.has(candidate)
      ) {
        return candidate;
      }
    }

    current = current.cause;
  }

  return null;
}
