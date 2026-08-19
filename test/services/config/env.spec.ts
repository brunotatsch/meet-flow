import { describe, expect, it } from "vitest";
import { loadDirectDatabaseUrl } from "@services/config/database-env";
import {
  assertDevelopmentDatabaseTargets,
  assertDevelopmentRuntimeDatabaseUrl,
} from "@services/config/development-database";
import { loadEnv } from "@services/config/env";

const validSource = {
  NODE_ENV: "test",
  PORT: "3001",
  APP_URL: "http://localhost:3001",
  DATABASE_URL: "postgres://meetflow:meetflow@localhost:5433/meetflow_test",
  BETTER_AUTH_SECRET: "test-secret-change-me-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3001",
};

const productionSource = {
  ...validSource,
  NODE_ENV: "production",
  APP_URL: "https://meet-flow.example",
  DATABASE_URL:
    "postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
  BETTER_AUTH_URL: "https://meet-flow.example",
};

const developmentSource = {
  ...validSource,
  NODE_ENV: "development",
  DATABASE_URL:
    "postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
};

describe("loadEnv", () => {
  it("aceita um ambiente válido e converte PORT para número", () => {
    const env = loadEnv(validSource);

    expect(env).toEqual({
      NODE_ENV: "test",
      PORT: 3001,
      APP_URL: "http://localhost:3001",
      CORS_ALLOWED_ORIGINS: "",
      LOG_LEVEL: "info",
      GLOBAL_RATE_LIMIT_MAX: 300,
      GLOBAL_RATE_LIMIT_WINDOW_MS: 60_000,
      DATABASE_URL: "postgres://meetflow:meetflow@localhost:5433/meetflow_test",
      BETTER_AUTH_SECRET: "test-secret-change-me-0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3001",
    });
  });

  it("aplica development como padrão de NODE_ENV quando ausente", () => {
    const { NODE_ENV: _NODE_ENV, ...rest } = developmentSource;
    const env = loadEnv(rest);

    expect(env.NODE_ENV).toBe("development");
  });

  it("aplica 3000 como padrão de PORT quando ausente", () => {
    const { PORT: _PORT, ...rest } = validSource;
    const env = loadEnv(rest);

    expect(env.PORT).toBe(3000);
  });

  it("rejeita quando DATABASE_URL está ausente", () => {
    const { DATABASE_URL: _DATABASE_URL, ...rest } = validSource;

    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("rejeita quando APP_URL não é uma URL válida", () => {
    expect(() => loadEnv({ ...validSource, APP_URL: "nao-e-uma-url" })).toThrow(/APP_URL/);
  });

  it("aceita allowlist CORS separada por vírgula e rejeita path/origem inválida", () => {
    expect(
      loadEnv({
        ...validSource,
        CORS_ALLOWED_ORIGINS: "https://admin.example.com,http://localhost:4173",
      }).CORS_ALLOWED_ORIGINS,
    ).toBe("https://admin.example.com,http://localhost:4173");

    expect(() =>
      loadEnv({ ...validSource, CORS_ALLOWED_ORIGINS: "https://admin.example.com/private" }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() => loadEnv({ ...validSource, CORS_ALLOWED_ORIGINS: "nao-e-url" })).toThrow(
      /CORS_ALLOWED_ORIGINS/,
    );
  });

  it("converte e valida os limites globais", () => {
    const loaded = loadEnv({
      ...validSource,
      GLOBAL_RATE_LIMIT_MAX: "42",
      GLOBAL_RATE_LIMIT_WINDOW_MS: "15000",
    });

    expect(loaded.GLOBAL_RATE_LIMIT_MAX).toBe(42);
    expect(loaded.GLOBAL_RATE_LIMIT_WINDOW_MS).toBe(15_000);
    expect(() => loadEnv({ ...validSource, GLOBAL_RATE_LIMIT_MAX: "0" })).toThrow(
      /GLOBAL_RATE_LIMIT_MAX/,
    );
  });

  it("rejeita quando DATABASE_URL não usa o protocolo postgres", () => {
    expect(() =>
      loadEnv({ ...validSource, DATABASE_URL: "mysql://user:pass@localhost:3306/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("aceita o Transaction pooler com TLS em produção", () => {
    expect(loadEnv(productionSource).DATABASE_URL).toBe(productionSource.DATABASE_URL);
  });

  it("o preflight aceita Supabase local ou Transaction pooler remoto", () => {
    expect(() =>
      assertDevelopmentRuntimeDatabaseUrl(developmentSource.DATABASE_URL, "remote"),
    ).not.toThrow();
    expect(() =>
      assertDevelopmentRuntimeDatabaseUrl(
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        "local",
      ),
    ).not.toThrow();
    expect(() =>
      assertDevelopmentRuntimeDatabaseUrl(
        "postgresql://meetflow:secret@localhost:5433/meetflow",
        "local",
      ),
    ).toThrow(/54322/);

    expect(() =>
      assertDevelopmentRuntimeDatabaseUrl(
        "postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
        "remote",
      ),
    ).toThrow(/sslmode/);
  });

  it("o preflight exige que as duas URLs apontem ao mesmo projeto e banco", () => {
    const runtime = developmentSource.DATABASE_URL;
    const direct =
      "postgresql://postgres:secret@db.project.supabase.co:5432/postgres?sslmode=require";

    expect(() => assertDevelopmentDatabaseTargets(runtime, direct, "remote")).not.toThrow();
    const local = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    expect(() => assertDevelopmentDatabaseTargets(local, local, "local")).not.toThrow();
    expect(() => assertDevelopmentDatabaseTargets(local, direct, "local")).toThrow(
      /DIRECT_DATABASE_URL local/,
    );
    expect(() =>
      assertDevelopmentDatabaseTargets(
        runtime,
        "postgresql://postgres:secret@db.other.supabase.co:5432/postgres?sslmode=require",
        "remote",
      ),
    ).toThrow(/projetos Supabase diferentes/);
    expect(() =>
      assertDevelopmentDatabaseTargets(
        runtime,
        "postgresql://postgres:secret@db.project.supabase.co:5432/outro?sslmode=require",
        "remote",
      ),
    ).toThrow(/bancos diferentes/);
  });

  it("rejeita conexão de runtime fora da porta 6543 em produção", () => {
    expect(() =>
      loadEnv({
        ...productionSource,
        DATABASE_URL:
          "postgresql://postgres:secret@db.project.supabase.co:5432/postgres?sslmode=require",
      }),
    ).toThrow(/6543/);
  });

  it("rejeita conexão de produção sem TLS explícito", () => {
    expect(() =>
      loadEnv({
        ...productionSource,
        DATABASE_URL:
          "postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
      }),
    ).toThrow(/sslmode/);
  });

  it("rejeita quando NODE_ENV tem um valor fora do enum", () => {
    expect(() => loadEnv({ ...validSource, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("rejeita quando BETTER_AUTH_SECRET está ausente", () => {
    const { BETTER_AUTH_SECRET: _BETTER_AUTH_SECRET, ...rest } = validSource;

    expect(() => loadEnv(rest)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejeita um BETTER_AUTH_SECRET curto demais para assinar sessão", () => {
    expect(() => loadEnv({ ...validSource, BETTER_AUTH_SECRET: "curto" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("rejeita quando BETTER_AUTH_URL não é uma URL válida", () => {
    expect(() => loadEnv({ ...validSource, BETTER_AUTH_URL: "nao-e-uma-url" })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });
});

describe("loadDirectDatabaseUrl", () => {
  it("carrega a credencial administrativa separada", () => {
    expect(
      loadDirectDatabaseUrl({
        NODE_ENV: "test",
        DIRECT_DATABASE_URL: "postgres://meetflow:meetflow@localhost:5433/meetflow_test",
      }),
    ).toBe("postgres://meetflow:meetflow@localhost:5433/meetflow_test");
  });

  it("exige DIRECT_DATABASE_URL", () => {
    expect(() => loadDirectDatabaseUrl({ NODE_ENV: "test" })).toThrow(/DIRECT_DATABASE_URL/);
  });

  it("exige porta 5432 e TLS para migrations em produção", () => {
    expect(() =>
      loadDirectDatabaseUrl({
        NODE_ENV: "production",
        DIRECT_DATABASE_URL:
          "postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
      }),
    ).toThrow(/5432/);

    expect(() =>
      loadDirectDatabaseUrl({
        NODE_ENV: "production",
        DIRECT_DATABASE_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      }),
    ).toThrow(/sslmode/);
  });

  it("em modo remoto também exige porta 5432 e TLS para migrations em desenvolvimento", () => {
    expect(() =>
      loadDirectDatabaseUrl({
        NODE_ENV: "development",
        DEV_DATABASE_MODE: "remote",
        DIRECT_DATABASE_URL: "postgresql://meetflow:secret@localhost:5433/meetflow",
      }),
    ).toThrow(/desenvolvimento.*5432/);

    expect(() =>
      loadDirectDatabaseUrl({
        NODE_ENV: "development",
        DEV_DATABASE_MODE: "remote",
        DIRECT_DATABASE_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      }),
    ).toThrow(/desenvolvimento.*sslmode/);
  });

  it("resolve a conexão administrativa canônica do Supabase local sem depender do .env", () => {
    const local = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

    expect(
      loadDirectDatabaseUrl({
        NODE_ENV: "development",
        DEV_DATABASE_MODE: "local",
      }),
    ).toBe(local);
  });

  it("rejeita modo de banco desconhecido", () => {
    expect(() =>
      loadDirectDatabaseUrl({
        NODE_ENV: "development",
        DEV_DATABASE_MODE: "automatico",
        DIRECT_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      }),
    ).toThrow(/DEV_DATABASE_MODE/);
  });
});
