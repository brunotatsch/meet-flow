import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "@services/http/server";
import { BookingCancellationToken } from "@services/notifications/domain/cancellation-token";

const SECRET = "cancelamento-seguro-para-testes-0123456789";
let app: FastifyInstance;

beforeEach(() => {
  app = buildServer({
    security: { globalRateLimit: false },
    api: {
      notifications: {
        cancellationSecret: SECRET,
        appUrl: "https://meetflow.example",
      },
    },
  });
});

afterEach(async () => {
  await app.close();
});

describe("POST /api/v1/public/bookings/cancel", () => {
  it("explica a expiração e não consulta nem altera a reserva", async () => {
    const token = new BookingCancellationToken(SECRET).issue({
      bookingId: "11111111-1111-4111-8111-111111111111",
      companyId: "22222222-2222-4222-8222-222222222222",
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/bookings/cancel",
      payload: { token },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      code: "CANCELLATION_LINK_EXPIRED",
      message: expect.stringMatching(/nenhuma reserva foi alterada/i),
    });
  });

  it("não revela detalhes para token adulterado", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/bookings/cancel",
      payload: { token: "a".repeat(80) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_CANCELLATION_TOKEN" });
  });
});
