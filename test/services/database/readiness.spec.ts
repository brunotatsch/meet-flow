import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertDatabaseReady,
  DatabaseSchemaNotReadyError,
  LATEST_MIGRATION,
} from "@services/database/readiness";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("readiness do banco", () => {
  it("mantém o marcador alinhado ao journal e ao hash da migration mais recente", () => {
    const journal = JSON.parse(
      readFileSync(`${repositoryRoot}/drizzle/meta/_journal.json`, "utf8"),
    ) as { entries: Array<{ when: number; tag: string }> };
    const latest = journal.entries.at(-1);

    expect(latest).toBeDefined();
    expect(latest!.when).toBe(LATEST_MIGRATION.createdAt);

    const migration = readFileSync(`${repositoryRoot}/drizzle/${latest!.tag}.sql`);
    expect(createHash("sha256").update(migration).digest("hex")).toBe(LATEST_MIGRATION.hash);
  });

  it("aceita somente o marcador exato da migration mais recente", async () => {
    await expect(assertDatabaseReady(async () => [{ schemaReady: true }])).resolves.toBeUndefined();

    await expect(assertDatabaseReady(async () => [{ schemaReady: false }])).rejects.toBeInstanceOf(
      DatabaseSchemaNotReadyError,
    );
  });

  it("trata banco ainda não migrado como schema não pronto", async () => {
    const missingTable = Object.assign(new Error("relation does not exist"), {
      errno: "42P01",
    });

    await expect(
      assertDatabaseReady(async () => {
        throw new Error("query failed", { cause: missingTable });
      }),
    ).rejects.toBeInstanceOf(DatabaseSchemaNotReadyError);
  });
});
