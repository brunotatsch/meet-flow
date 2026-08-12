import { describe, expect, it } from "vitest";
import {
  AvailabilityQuerySchema,
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
});

describe("BookingResponseSchema", () => {
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
      createdAt: "2026-01-01T09:00:00.000Z",
      updatedAt: "2026-01-01T09:00:00.000Z",
    };

    expect(() => BookingResponseSchema.parse(response)).toThrow();
  });
});
