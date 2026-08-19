import { describe, expect, it } from "vitest";
import {
  createAdministrativeDatabaseOptions,
  createRuntimeDatabaseOptions,
  databaseUsesTls,
} from "@services/database/connection-options";

describe("opções de conexão do Supabase", () => {
  it("limita o pool Serverless e desabilita prepared statements nomeados", () => {
    const options = createRuntimeDatabaseOptions(
      "postgresql://postgres.project:secret@pooler.supabase.com:6543/postgres?sslmode=require",
    );

    expect(options).toMatchObject({
      max: 1,
      idleTimeout: 20,
      maxLifetime: 300,
      connectionTimeout: 10,
      prepare: false,
      tls: true,
    });
  });

  it("mantém a conexão administrativa one-shot e conservadora", () => {
    const options = createAdministrativeDatabaseOptions(
      "postgresql://postgres:secret@db.project.supabase.co:5432/postgres?sslmode=verify-full",
    );

    expect(options).toMatchObject({
      max: 1,
      idleTimeout: 5,
      connectionTimeout: 10,
      prepare: false,
      tls: true,
    });
  });

  it("não força TLS no Postgres efêmero do CI", () => {
    const databaseUrl = "postgres://meetflow:meetflow@localhost:5433/meetflow_test";

    expect(databaseUsesTls(databaseUrl)).toBe(false);
    expect(createRuntimeDatabaseOptions(databaseUrl)).toMatchObject({ tls: false });
  });
});
