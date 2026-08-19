import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("migration do rate limit distribuído", () => {
  it("cria chave compartilhada, índice de expiração e bloqueia a Data API", () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../../../drizzle/0005_serverless_hardening.sql", import.meta.url)),
      "utf8",
    );

    expect(migration).toContain('PRIMARY KEY("scope", "key_hash")');
    expect(migration).toContain('CREATE INDEX "api_rate_limits_expires_at_idx"');
    expect(migration).toContain('ALTER TABLE "api_rate_limits" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("REVOKE ALL PRIVILEGES");
  });
});
