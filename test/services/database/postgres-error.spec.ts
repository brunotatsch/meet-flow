import { describe, expect, it } from "vitest";
import { findPostgresUnavailableCode } from "@services/database/postgres-error";

function wrappedPostgresError(fields: { code?: string; errno?: string }): Error {
  return new Error("query failed", {
    cause: Object.assign(new Error("detalhe interno"), fields),
  });
}

describe("findPostgresUnavailableCode", () => {
  it.each([
    ["ERR_POSTGRES_CONNECTION_CLOSED", { code: "ERR_POSTGRES_CONNECTION_CLOSED" }],
    ["08006", { errno: "08006" }],
    ["28P01", { errno: "28P01" }],
    ["42P01", { errno: "42P01" }],
    ["42703", { errno: "42703" }],
    ["42883", { errno: "42883" }],
  ])("classifica %s como indisponibilidade do serviço", (expected, fields) => {
    expect(findPostgresUnavailableCode(wrappedPostgresError(fields))).toBe(expected);
  });

  it("não confunde conflito de negócio ou erro comum com indisponibilidade", () => {
    expect(findPostgresUnavailableCode(wrappedPostgresError({ errno: "23505" }))).toBeNull();
    expect(findPostgresUnavailableCode(new Error("falha comum"))).toBeNull();
  });
});
