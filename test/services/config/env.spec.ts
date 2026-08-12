import { describe, expect, it } from "vitest";
import { loadEnv } from "@services/config/env";

const validSource = {
  NODE_ENV: "test",
  PORT: "3001",
  APP_URL: "http://localhost:3001",
  DATABASE_URL: "postgres://meetflow:meetflow@localhost:5433/meetflow_test",
  BETTER_AUTH_SECRET: "test-secret-change-me-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3001",
};

describe("loadEnv", () => {
  it("aceita um ambiente válido e converte PORT para número", () => {
    const env = loadEnv(validSource);

    expect(env).toEqual({
      NODE_ENV: "test",
      PORT: 3001,
      APP_URL: "http://localhost:3001",
      DATABASE_URL: "postgres://meetflow:meetflow@localhost:5433/meetflow_test",
      BETTER_AUTH_SECRET: "test-secret-change-me-0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3001",
    });
  });

  it("aplica development como padrão de NODE_ENV quando ausente", () => {
    const { NODE_ENV: _NODE_ENV, ...rest } = validSource;
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

  it("rejeita quando DATABASE_URL não usa o protocolo postgres", () => {
    expect(() =>
      loadEnv({ ...validSource, DATABASE_URL: "mysql://user:pass@localhost:3306/db" }),
    ).toThrow(/DATABASE_URL/);
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
