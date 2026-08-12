import { describe, expect, it } from "vitest";
import {
  CompanyPublicSchema,
  PublicCompanyResponseSchema,
  SignUpSchema,
} from "@shared/schemas/company.schema";

const validSignUp = {
  user: {
    name: "Bruno Tatsch",
    email: "bruno@example.com",
    password: "senha-segura-123",
  },
  company: {
    name: "Hotel Central",
    slug: "hotel-central",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  },
};

describe("SignUpSchema", () => {
  it("aceita um payload válido", () => {
    expect(() => SignUpSchema.parse(validSignUp)).not.toThrow();
  });

  it("rejeita type fora do enum de CompanyType", () => {
    expect(() =>
      SignUpSchema.parse({
        ...validSignUp,
        company: { ...validSignUp.company, type: "hostel" },
      }),
    ).toThrow();
  });

  it("rejeita slug com caracteres inválidos", () => {
    expect(() =>
      SignUpSchema.parse({
        ...validSignUp,
        company: { ...validSignUp.company, slug: "Hotel Central" },
      }),
    ).toThrow();
  });

  it("rejeita timezone que não é um fuso IANA válido", () => {
    expect(() =>
      SignUpSchema.parse({
        ...validSignUp,
        company: { ...validSignUp.company, timezone: "Nao/Existe" },
      }),
    ).toThrow();
  });

  it("normaliza slug e e-mail antes de validar", () => {
    const parsed = SignUpSchema.parse({
      user: { ...validSignUp.user, email: "  Bruno@Example.COM " },
      company: { ...validSignUp.company, slug: "  Hotel-Central  " },
    });

    expect(parsed.user.email).toBe("bruno@example.com");
    expect(parsed.company.slug).toBe("hotel-central");
  });

  it("rejeita password curta", () => {
    expect(() =>
      SignUpSchema.parse({
        ...validSignUp,
        user: { ...validSignUp.user, password: "curta" },
      }),
    ).toThrow();
  });
});

describe("CompanyPublicSchema", () => {
  it("aceita um payload público válido", () => {
    const company = {
      id: "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e6f",
      name: "Hotel Central",
      slug: "hotel-central",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    };

    expect(() => CompanyPublicSchema.parse(company)).not.toThrow();
  });
});

describe("PublicCompanyResponseSchema", () => {
  it("aceita nome, tipo e timezone", () => {
    const company = {
      name: "Hotel Central",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    };

    expect(() => PublicCompanyResponseSchema.parse(company)).not.toThrow();
  });

  it("descarta id e slug como chaves desconhecidas", () => {
    const parsed = PublicCompanyResponseSchema.parse({
      id: "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e6f",
      name: "Hotel Central",
      slug: "hotel-central",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    });

    expect(parsed).toEqual({
      name: "Hotel Central",
      type: "hotel",
      timezone: "America/Sao_Paulo",
    });
  });
});
