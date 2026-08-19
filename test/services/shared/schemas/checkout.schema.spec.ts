import { describe, expect, it } from "vitest";
import {
  CreateBookingCheckoutResponseSchema,
  PublicCheckoutStatusResponseSchema,
} from "@shared/schemas/checkout.schema";

const booking = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: "33333333-3333-4333-8333-333333333333",
  roomId: "11111111-1111-4111-8111-111111111111",
  customerName: "Ana Prado",
  customerEmail: "ana@exemplo.com",
  customerPhone: null,
  startsAt: "2030-06-04T09:00:00-03:00",
  endsAt: "2030-06-04T10:00:00-03:00",
  status: "pending",
  totalInCents: 12_000,
  notes: null,
  expiresAt: "2030-06-04T12:15:00.000Z",
  stripeCheckoutSessionId: "cs_test_booking",
  createdAt: "2030-06-04T00:00:00.000Z",
  updatedAt: "2030-06-04T00:00:00.000Z",
};

describe("schemas de Checkout", () => {
  it("valida a reserva pendente e a URL externa criada pelo servidor", () => {
    const result = CreateBookingCheckoutResponseSchema.parse({
      booking,
      checkout: {
        sessionId: "cs_test_booking",
        url: "https://checkout.stripe.com/c/pay/cs_test_booking",
        expiresAt: "2030-06-04T12:15:00.000Z",
      },
    });

    expect(result.booking.status).toBe("pending");
    if (!result.checkout) throw new Error("Checkout pago deveria existir.");
    expect(result.checkout.sessionId).toBe("cs_test_booking");
  });

  it("rejeita uma URL de Checkout inválida", () => {
    expect(() =>
      CreateBookingCheckoutResponseSchema.parse({
        booking,
        checkout: {
          sessionId: "cs_test_booking",
          url: "nao-e-url",
          expiresAt: "2030-06-04T12:15:00.000Z",
        },
      }),
    ).toThrow();
  });

  it("aceita checkout nulo quando a reserva gratuita já foi confirmada", () => {
    const result = CreateBookingCheckoutResponseSchema.parse({
      booking: {
        ...booking,
        status: "confirmed",
        totalInCents: 0,
        expiresAt: null,
        stripeCheckoutSessionId: null,
      },
      checkout: null,
    });

    expect(result.checkout).toBeNull();
    expect(result.booking.status).toBe("confirmed");
  });

  it("descarta PII da view pública de status", () => {
    const result = PublicCheckoutStatusResponseSchema.parse({
      state: "confirmed",
      booking,
      timeZone: "America/Sao_Paulo",
    });

    expect(result.booking).toEqual({
      id: booking.id,
      roomId: booking.roomId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      totalInCents: booking.totalInCents,
    });
    expect(result.booking).not.toHaveProperty("customerEmail");
  });
});
