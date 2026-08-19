import { describe, expect, it } from "vitest";
import {
  AdminCreateBookingSchema,
  BookingResponseSchema,
  RescheduleBookingSchema,
} from "@shared/schemas/booking.schema";

const BASE_RESPONSE = {
  id: "44444444-4444-4444-8444-444444444444",
  companyId: "11111111-1111-4111-8111-111111111111",
  roomId: "22222222-2222-4222-8222-222222222222",
  customerName: "Ana Prado",
  customerEmail: "ana@exemplo.com",
  customerPhone: null,
  startsAt: "2030-06-04T09:00:00-03:00",
  endsAt: "2030-06-04T10:00:00-03:00",
  status: "no_show",
  totalInCents: 12_000,
  notes: null,
  expiresAt: null,
  stripeCheckoutSessionId: null,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

describe("contratos da agenda operacional", () => {
  it("aceita no_show e mantém compatibilidade com respostas antigas sem horários reais", () => {
    const parsed = BookingResponseSchema.parse(BASE_RESPONSE);

    expect(parsed.status).toBe("no_show");
    expect(parsed.checkedInAt).toBeNull();
    expect(parsed.checkedOutAt).toBeNull();
  });

  it("aceita horários reais persistidos", () => {
    const parsed = BookingResponseSchema.parse({
      ...BASE_RESPONSE,
      status: "completed",
      checkedInAt: "2030-06-04T12:05:00.000Z",
      checkedOutAt: "2030-06-04T13:02:00.000Z",
    });

    expect(parsed.checkedInAt).toBe("2030-06-04T12:05:00.000Z");
    expect(parsed.checkedOutAt).toBe("2030-06-04T13:02:00.000Z");
  });

  it("valida os horários de parede de criação e reagendamento", () => {
    expect(
      AdminCreateBookingSchema.safeParse({
        roomId: BASE_RESPONSE.roomId,
        date: "2030-06-04",
        startTime: "09:00",
        endTime: "10:00",
        customerName: "Ana Prado",
        customerEmail: "ana@exemplo.com",
      }).success,
    ).toBe(true);
    expect(
      RescheduleBookingSchema.safeParse({
        date: "2030-06-04",
        startTime: "10:00",
        endTime: "09:00",
      }).success,
    ).toBe(false);
  });
});
