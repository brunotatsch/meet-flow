import { describe, expect, it } from "vitest";
import { assertAppliedMigrations, MigrationDriftError } from "@services/database/migrator";

const expected = [
  { folderMillis: 1000, hash: "hash-1" },
  { folderMillis: 2000, hash: "hash-2" },
];

describe("verificação das migrations aplicadas", () => {
  it("aceita a mesma cadeia independentemente do tipo retornado para bigint", () => {
    expect(() =>
      assertAppliedMigrations(expected, [
        { created_at: "1000", hash: "hash-1" },
        { created_at: 2000n, hash: "hash-2" },
      ]),
    ).not.toThrow();
  });

  it("rejeita migration ausente, alterada ou desconhecida", () => {
    expect(() => assertAppliedMigrations(expected, [{ created_at: 1000, hash: "hash-1" }])).toThrow(
      MigrationDriftError,
    );

    expect(() =>
      assertAppliedMigrations(expected, [
        { created_at: 1000, hash: "hash-1" },
        { created_at: 2000, hash: "outro-hash" },
      ]),
    ).toThrow(/diverge/);

    expect(() =>
      assertAppliedMigrations(expected, [
        { created_at: 1000, hash: "hash-1" },
        { created_at: 2000, hash: "hash-2" },
        { created_at: 3000, hash: "hash-futura" },
      ]),
    ).toThrow(/desatualizado/);
  });
});
