import { describe, expect, it } from "vitest";
import { SessionSchema, SignInSchema } from "@shared/schemas/auth.schema";
import { NormalizedEmail } from "@shared/schemas/email";

describe("NormalizedEmail", () => {
  it("apara espaços e baixa a caixa", () => {
    expect(NormalizedEmail.parse("  Bruno@Exemplo.COM  ")).toBe("bruno@exemplo.com");
  });

  it("valida o formato depois de normalizar, não antes", () => {
    expect(() => NormalizedEmail.parse(" ana@exemplo.com ")).not.toThrow();
    expect(() => NormalizedEmail.parse("ana arroba exemplo.com")).toThrow();
  });
});

describe("SignInSchema", () => {
  it("normaliza o e-mail", () => {
    expect(SignInSchema.parse({ email: " Ana@Exemplo.com ", password: "x" }).email).toBe(
      "ana@exemplo.com",
    );
  });

  it("rejeita senha vazia", () => {
    expect(() => SignInSchema.parse({ email: "ana@exemplo.com", password: "" })).toThrow();
  });
});

describe("SessionSchema", () => {
  it("aceita a resposta de /me", () => {
    const session = {
      user: { id: "aBc123", name: "Ana Prado", email: "ana@exemplo.com" },
      company: {
        id: "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e6f",
        name: "Hotel Central",
        slug: "hotel-central",
        type: "hotel",
        timezone: "America/Sao_Paulo",
      },
      role: "owner",
    };

    expect(() => SessionSchema.parse(session)).not.toThrow();
  });

  it("rejeita um id de company que não é uuid", () => {
    expect(() =>
      SessionSchema.parse({
        user: { id: "aBc123", name: "Ana Prado", email: "ana@exemplo.com" },
        company: {
          id: "nao-e-uuid",
          name: "Hotel Central",
          slug: "hotel-central",
          type: "hotel",
          timezone: "America/Sao_Paulo",
        },
        role: "owner",
      }),
    ).toThrow();
  });
});
