import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@services/database/client";
import { requireCronSecret } from "../cron-auth";

const CLEANUP_BATCH_SIZE = 10_000;

interface DeletedCountRow extends Record<string, unknown> {
  deleted: number | string | bigint;
}

export abstract class ExpiredRateLimitCleaner {
  abstract cleanup(limit?: number): Promise<number>;
}

export class DrizzleExpiredRateLimitCleaner extends ExpiredRateLimitCleaner {
  async cleanup(limit = CLEANUP_BATCH_SIZE): Promise<number> {
    const rows = await db.execute<DeletedCountRow>(sql`
      WITH candidates AS (
        SELECT "scope", "key_hash"
        FROM "api_rate_limits"
        WHERE "expires_at" <= clock_timestamp()
        ORDER BY "expires_at"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ),
      deleted AS (
        DELETE FROM "api_rate_limits" AS target
        USING candidates
        WHERE target."scope" = candidates."scope"
          AND target."key_hash" = candidates."key_hash"
        RETURNING 1
      )
      SELECT count(*)::integer AS "deleted" FROM deleted
    `);

    return Number(rows[0]?.deleted ?? 0);
  }
}

export async function registerRateLimitMaintenanceRoutes(
  app: FastifyInstance,
  cleaner: ExpiredRateLimitCleaner = new DrizzleExpiredRateLimitCleaner(),
): Promise<void> {
  app.post("/jobs/cleanup-rate-limits", (request, reply) =>
    cleanupExpiredRateLimits(request, reply, cleaner),
  );
}

async function cleanupExpiredRateLimits(
  request: FastifyRequest,
  reply: FastifyReply,
  cleaner: ExpiredRateLimitCleaner,
): Promise<FastifyReply> {
  requireCronSecret(request, "Job de limpeza do rate limit não configurado.");
  return reply.send({ deleted: await cleaner.cleanup() });
}
