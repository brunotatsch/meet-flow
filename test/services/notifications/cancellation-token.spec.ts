import { describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { CancelBookingWithTokenUseCase } from "@services/notifications/application/cancel-booking-with-token.use-case";
import {
  BookingCancellationToken,
  ExpiredCancellationTokenError,
  InvalidCancellationTokenError,
} from "@services/notifications/domain/cancellation-token";
import { FixedClock } from "../bookings/fixed-clock";
import { InMemoryBookingRepository } from "../bookings/in-memory-booking.repository";

const SECRET = "cancelamento-seguro-para-testes-0123456789";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2030-06-01T12:00:00.000Z");
const START = new Date("2030-06-02T12:00:00.000Z");

describe("BookingCancellationToken", () => {
  it("autentica ids opacos e rejeita qualquer adulteração", () => {
    const service = new BookingCancellationToken(SECRET);
    const token = service.issue({
      bookingId: ROOM_ID,
      companyId: COMPANY_ID,
      expiresAt: START,
    });

    expect(service.verify(token, NOW)).toMatchObject({
      bookingId: ROOM_ID,
      companyId: COMPANY_ID,
    });
    expect(() => service.verify(`${token.split(".")[0]}.assinatura-falsa`, NOW)).toThrow(
      InvalidCancellationTokenError,
    );
  });

  it("expira no início da reserva", () => {
    const service = new BookingCancellationToken(SECRET);
    const token = service.issue({
      bookingId: ROOM_ID,
      companyId: COMPANY_ID,
      expiresAt: START,
    });

    expect(() => service.verify(token, START)).toThrow(ExpiredCancellationTokenError);
  });
});

describe("CancelBookingWithTokenUseCase", () => {
  it("cancela sem conta quando o token é válido", async () => {
    const bookings = new InMemoryBookingRepository();
    const booking = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: START,
      endsAt: new Date("2030-06-02T13:00:00.000Z"),
    });
    const tokenService = new BookingCancellationToken(SECRET);
    const useCase = new CancelBookingWithTokenUseCase(bookings, tokenService, new FixedClock(NOW));
    const token = tokenService.issue({
      bookingId: booking.id,
      companyId: COMPANY_ID,
      expiresAt: START,
    });

    const cancelled = await useCase.execute(token);
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    expect(cancelled.cancellationReason).toBe("customer");
  });

  it("token expirado não altera a reserva", async () => {
    const bookings = new InMemoryBookingRepository();
    const booking = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: START,
      endsAt: new Date("2030-06-02T13:00:00.000Z"),
    });
    const tokenService = new BookingCancellationToken(SECRET);
    const useCase = new CancelBookingWithTokenUseCase(
      bookings,
      tokenService,
      new FixedClock(START),
    );
    const token = tokenService.issue({
      bookingId: booking.id,
      companyId: COMPANY_ID,
      expiresAt: START,
    });

    await expect(useCase.execute(token)).rejects.toThrow(ExpiredCancellationTokenError);
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
  });
});
