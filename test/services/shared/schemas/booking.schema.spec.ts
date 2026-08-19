import { describe, expect, it } from "vitest";
import {
  AvailabilityQuerySchema,
  AvailabilityResponseSchema,
  BookingFiltersSchema,
  BookingResponseSchema,
  CreateBookingSchema,
} from "@shared/schemas/booking.schema";

const roomId = "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e6f";
const companyId = "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e70";
const bookingId = "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e71";

const validBooking = {
  roomId,
  startsAt: "2026-01-01T10:00:00.000Z",
  endsAt: "2026-01-01T11:00:00.000Z",
  customerName: "Maria Silva",
  customerEmail: "maria@example.com",
};

describe("AvailabilityQuerySchema", () => {
  it("aceita roomId e date válidos", () => {
    expect(() => AvailabilityQuerySchema.parse({ roomId, date: "2026-01-01" })).not.toThrow();
  });

  it("rejeita date malformada", () => {
    expect(() => AvailabilityQuerySchema.parse({ roomId, date: "01/01/2026" })).toThrow();
  });

  it("rejeita date com timestamp completo em vez de YYYY-MM-DD", () => {
    expect(() =>
      AvailabilityQuerySchema.parse({ roomId, date: "2026-01-01T10:00:00.000Z" }),
    ).toThrow();
  });

  it("rejeita roomId que não é um uuid", () => {
    expect(() =>
      AvailabilityQuerySchema.parse({ roomId: "nao-e-uuid", date: "2026-01-01" }),
    ).toThrow();
  });
});

describe("AvailabilityResponseSchema", () => {
  function response(slots: unknown[]) {
    return { roomId, date: "2026-03-08", timezone: "America/New_York", slots };
  }

  it("aceita slots com offset explícito, inclusive mudando no mesmo dia", () => {
    const slots = [
      {
        startsAt: "2026-03-08T01:00:00-05:00",
        endsAt: "2026-03-08T02:00:00-05:00",
        available: true,
        priceInCents: 12_000,
      },
      {
        startsAt: "2026-03-08T03:00:00-04:00",
        endsAt: "2026-03-08T04:00:00-04:00",
        available: false,
        priceInCents: 12_000,
      },
    ];

    expect(() => AvailabilityResponseSchema.parse(response(slots))).not.toThrow();
  });

  it("aceita grade vazia, que é como um dia sem agenda se apresenta", () => {
    expect(() => AvailabilityResponseSchema.parse(response([]))).not.toThrow();
  });

  it("rejeita slot com horário local sem fuso", () => {
    const slots = [
      {
        startsAt: "2026-03-08T01:00:00",
        endsAt: "2026-03-08T02:00:00",
        available: true,
        priceInCents: 12_000,
      },
    ];

    expect(() => AvailabilityResponseSchema.parse(response(slots))).toThrow();
  });

  it("rejeita preço fracionado ou negativo", () => {
    for (const priceInCents of [1_000.5, -1]) {
      const slots = [
        {
          startsAt: "2026-03-08T01:00:00-05:00",
          endsAt: "2026-03-08T02:00:00-05:00",
          available: true,
          priceInCents,
        },
      ];

      expect(() => AvailabilityResponseSchema.parse(response(slots))).toThrow();
    }
  });
});

describe("CreateBookingSchema", () => {
  it("aceita um payload válido", () => {
    expect(() => CreateBookingSchema.parse(validBooking)).not.toThrow();
  });

  it("rejeita endsAt igual a startsAt", () => {
    expect(() =>
      CreateBookingSchema.parse({ ...validBooking, endsAt: validBooking.startsAt }),
    ).toThrow();
  });

  it("rejeita endsAt anterior a startsAt", () => {
    expect(() =>
      CreateBookingSchema.parse({
        ...validBooking,
        startsAt: "2026-01-01T11:00:00.000Z",
        endsAt: "2026-01-01T10:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejeita customerEmail inválido", () => {
    expect(() =>
      CreateBookingSchema.parse({ ...validBooking, customerEmail: "nao-e-email" }),
    ).toThrow();
  });

  /**
   * A remoção acontece aqui, na borda, e é o que garante que o preço do cliente
   * nunca chegue ao caso de uso: o total é recalculado no servidor a partir da
   * tarifa da sala.
   */
  it("descarta totalInCents e companyId enviados pelo cliente", () => {
    const parsed = CreateBookingSchema.parse({
      ...validBooking,
      totalInCents: 1,
      companyId,
      status: "confirmed",
    });

    expect(parsed).not.toHaveProperty("totalInCents");
    expect(parsed).not.toHaveProperty("companyId");
    expect(parsed).not.toHaveProperty("status");
  });
});

describe("BookingFiltersSchema", () => {
  const from = "2026-01-01T00:00:00.000Z";
  const to = "2026-01-08T00:00:00.000Z";

  it("aceita período com roomId opcional", () => {
    expect(() => BookingFiltersSchema.parse({ from, to })).not.toThrow();
    expect(() => BookingFiltersSchema.parse({ from, to, roomId })).not.toThrow();
  });

  it("rejeita período ausente, invertido ou de duração zero", () => {
    expect(() => BookingFiltersSchema.parse({ from })).toThrow();
    expect(() => BookingFiltersSchema.parse({ from: to, to: from })).toThrow();
    expect(() => BookingFiltersSchema.parse({ from, to: from })).toThrow();
  });

  it("rejeita data sem fuso", () => {
    expect(() => BookingFiltersSchema.parse({ from: "2026-01-01T00:00:00", to })).toThrow();
  });
});

describe("BookingResponseSchema", () => {
  it("aceita horário no fuso da empresa, com offset explícito", () => {
    const response = {
      id: bookingId,
      companyId,
      roomId,
      customerName: "Maria Silva",
      customerEmail: "maria@example.com",
      customerPhone: null,
      startsAt: "2026-01-01T10:00:00-03:00",
      endsAt: "2026-01-01T11:00:00-03:00",
      status: "confirmed",
      totalInCents: 5000,
      notes: null,
      expiresAt: null,
      stripeCheckoutSessionId: null,
      createdAt: "2026-01-01T09:00:00.000Z",
      updatedAt: "2026-01-01T09:00:00.000Z",
    };

    expect(() => BookingResponseSchema.parse(response)).not.toThrow();
  });

  it("aceita um payload de resposta completo", () => {
    const response = {
      id: bookingId,
      companyId,
      roomId,
      customerName: "Maria Silva",
      customerEmail: "maria@example.com",
      customerPhone: null,
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T11:00:00.000Z",
      status: "confirmed",
      totalInCents: 5000,
      notes: null,
      expiresAt: "2026-01-01T09:31:00.000Z",
      stripeCheckoutSessionId: "cs_test_123",
      createdAt: "2026-01-01T09:00:00.000Z",
      updatedAt: "2026-01-01T09:00:00.000Z",
    };

    expect(() => BookingResponseSchema.parse(response)).not.toThrow();
  });

  it("rejeita status fora do enum de BookingStatus", () => {
    const response = {
      id: bookingId,
      companyId,
      roomId,
      customerName: "Maria Silva",
      customerEmail: "maria@example.com",
      customerPhone: null,
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T11:00:00.000Z",
      status: "unknown",
      totalInCents: 5000,
      notes: null,
      expiresAt: null,
      stripeCheckoutSessionId: null,
      createdAt: "2026-01-01T09:00:00.000Z",
      updatedAt: "2026-01-01T09:00:00.000Z",
    };

    expect(() => BookingResponseSchema.parse(response)).toThrow();
  });
});
