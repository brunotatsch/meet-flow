import { sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import { findPostgresFailure } from "./postgres-error";

export const LATEST_MIGRATION = {
  createdAt: 1_787_147_877_723,
  hash: "2b042154f2d2045cc2c1708058625aa3b48fd7196085d1d7ad98e60e0346c49d",
} as const;

export class DatabaseSchemaNotReadyError extends Error {
  constructor(cause?: unknown) {
    super("O schema do banco está desatualizado.", { cause });
    this.name = "DatabaseSchemaNotReadyError";
  }
}

export type DatabaseReadinessExecutor = (query: SQL) => PromiseLike<unknown>;

/**
 * Confere o marcador e o hash da migration mais recente sem executar migration
 * durante cold start ou request. Como o Drizzle aplica a cadeia em ordem, a 0009
 * só aparece depois das anteriores.
 */
export async function assertDatabaseReady(
  execute: DatabaseReadinessExecutor = (query) => db.execute(query),
): Promise<void> {
  let result: unknown;

  try {
    result = await execute(
      sql<{ schemaReady: boolean }>`
        SELECT EXISTS (
          SELECT 1
          FROM drizzle.__drizzle_migrations
          WHERE created_at = ${LATEST_MIGRATION.createdAt}
            AND hash = ${LATEST_MIGRATION.hash}
        ) AS "schemaReady"
      `,
    );
  } catch (error) {
    if (findPostgresFailure(error)?.sqlState === "42P01") {
      throw new DatabaseSchemaNotReadyError(error);
    }

    throw error;
  }

  const firstRow = Array.isArray(result)
    ? (result[0] as { schemaReady?: unknown } | undefined)
    : undefined;

  if (firstRow?.schemaReady !== true) {
    throw new DatabaseSchemaNotReadyError();
  }
}
