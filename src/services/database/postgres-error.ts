/** SQLSTATE de violação de unique. */
export const UNIQUE_VIOLATION = "23505";
/** SQLSTATE de violação de constraint de exclusão (usado por `bookings_no_overlap`). */
export const EXCLUSION_VIOLATION = "23P01";
/** SQLSTATE de violação de check. */
export const CHECK_VIOLATION = "23514";
/** SQLSTATE de violação de chave estrangeira. */
export const FOREIGN_KEY_VIOLATION = "23503";

export interface PostgresFailure {
  sqlState: string;
  /** Nome da constraint violada, quando o Postgres o informa. */
  constraint: string | null;
}

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
