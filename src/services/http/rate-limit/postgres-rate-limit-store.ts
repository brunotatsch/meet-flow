import { createHash } from "node:crypto";
import type {
  FastifyRateLimitOptions,
  FastifyRateLimitStore,
  FastifyRateLimitStoreCtor,
} from "@fastify/rate-limit";
import type { RouteOptions } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@services/database/client";

export interface RateLimitIncrementResult {
  current: number;
  ttl: number;
}

export interface RateLimitCounter {
  increment(scope: string, keyHash: string, timeWindow: number): Promise<RateLimitIncrementResult>;
}

interface RateLimitRow extends Record<string, unknown> {
  current: number | string | bigint;
  ttl: number | string | bigint;
}

interface StoreOptions extends FastifyRateLimitOptions {
  groupId?: string;
  routeInfo?: {
    method?: string | string[];
    url?: string;
    path?: string;
  };
}

/**
 * Contador de janela fixa persistido no Postgres.
 *
 * O `ON CONFLICT` faz incremento/reset em uma única instrução, portanto isolates
 * concorrentes da Vercel observam o mesmo limite. Apenas o SHA-256 da chave (IP
 * normalizado pelo plugin) é persistido; o identificador bruto nunca vai ao banco.
 */
export class DrizzleRateLimitCounter implements RateLimitCounter {
  async increment(
    scope: string,
    keyHash: string,
    timeWindow: number,
  ): Promise<RateLimitIncrementResult> {
    const rows = await db.execute<RateLimitRow>(sql`
      INSERT INTO "api_rate_limits" (
        "scope",
        "key_hash",
        "window_started_at",
        "expires_at",
        "hits"
      )
      VALUES (
        ${scope},
        ${keyHash},
        clock_timestamp(),
        clock_timestamp() + (${timeWindow} * interval '1 millisecond'),
        1
      )
      ON CONFLICT ("scope", "key_hash") DO UPDATE
      SET
        "hits" = CASE
          WHEN "api_rate_limits"."expires_at" <= EXCLUDED."window_started_at" THEN 1
          ELSE "api_rate_limits"."hits" + 1
        END,
        "window_started_at" = CASE
          WHEN "api_rate_limits"."expires_at" <= EXCLUDED."window_started_at"
            THEN EXCLUDED."window_started_at"
          ELSE "api_rate_limits"."window_started_at"
        END,
        "expires_at" = CASE
          WHEN "api_rate_limits"."expires_at" <= EXCLUDED."window_started_at"
            THEN EXCLUDED."expires_at"
          ELSE "api_rate_limits"."expires_at"
        END
      RETURNING
        "hits" AS "current",
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM ("expires_at" - clock_timestamp())) * 1000)
        )::bigint AS "ttl"
    `);

    const row = rows[0];
    if (!row) throw new Error("Postgres não retornou o contador de rate limit.");

    return {
      current: Number(row.current),
      ttl: Math.max(0, Number(row.ttl)),
    };
  }
}

/**
 * Cria a classe exigida por `@fastify/rate-limit` com namespace e adapter fixos.
 * O factory também permite testar a semântica da store sem abrir conexão real.
 */
export function createPostgresRateLimitStore(
  namespace: string,
  counter: RateLimitCounter = new DrizzleRateLimitCounter(),
): FastifyRateLimitStoreCtor {
  class PostgresRateLimitStore implements FastifyRateLimitStore {
    private readonly scope: string;

    constructor(options: FastifyRateLimitOptions) {
      this.scope = createScope(namespace, options as StoreOptions);
    }

    incr(
      key: string,
      callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
      timeWindow: number,
      _max: number,
    ): void {
      const keyHash = createHash("sha256").update(key).digest("hex");

      void counter.increment(this.scope, keyHash, timeWindow).then(
        (result) => callback(null, result),
        (error: unknown) => callback(toError(error)),
      );
    }

    child(routeOptions: RouteOptions & { path: string; prefix: string }): FastifyRateLimitStore {
      return new PostgresRateLimitStore(routeOptions);
    }
  }

  return PostgresRateLimitStore;
}

function createScope(namespace: string, options: StoreOptions): string {
  const method = options.routeInfo?.method;
  const normalizedMethod = Array.isArray(method) ? method.join(",") : (method ?? "all");
  const route = options.routeInfo?.url ?? options.routeInfo?.path ?? options.groupId ?? "global";

  return `${namespace}:${normalizedMethod}:${route}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Falha desconhecida no rate limit.");
}
