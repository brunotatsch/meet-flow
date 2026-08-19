import { beforeEach, describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { CreateBookingCheckoutUseCase } from "@services/billing/application/create-booking-checkout.use-case";
import {
  StripeGateway,
  type BookingCheckoutInput,
  type CheckoutSessionResult,
  type StripeWebhookEvent,
  type SubscriptionCheckoutInput,
} from "@services/billing/application/stripe-gateway";
import { CheckoutUnavailableError } from "@services/billing/domain/errors";
import { Booking } from "@services/bookings/domain/booking.entity";
import { Room } from "@services/rooms/domain/room.entity";
import { InMemoryRoomRepository } from "../rooms/in-memory-room.repository";
import { FixedClock } from "../bookings/fixed-clock";

const NOW = new Date("2026-08-01T00:00:00.000Z");
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const company = {
  id: COMPANY_ID,
  name: "Hotel Aurora",
  slug: "hotel-aurora",
  type: "hotel",
  timezone: "America/Sao_Paulo",
};

class FakeStripeGateway extends StripeGateway {
  bookingInputs: BookingCheckoutInput[] = [];
  expiredSessions: string[] = [];
  failure: Error | null = null;

  async createBookingCheckout(input: BookingCheckoutInput): Promise<CheckoutSessionResult> {
    this.bookingInputs.push(input);
    if (this.failure) throw this.failure;
    return {
      id: "cs_test_123",
      url: "https://checkout.stripe.test/123",
      expiresAt: input.expiresAt,
    };
  }

  createSubscriptionCheckout(_input: SubscriptionCheckoutInput): Promise<CheckoutSessionResult> {
    throw new Error("não usado");
  }
  createCustomerPortal(_customerId: string, _returnUrl: string): Promise<string> {
    throw new Error("não usado");
  }
  async expireCheckoutSession(sessionId: string): Promise<void> {
    this.expiredSessions.push(sessionId);
  }
  verifyWebhook(_payload: Buffer, _signature: string): Promise<StripeWebhookEvent> {
    throw new Error("não usado");
  }
}

class FakeCheckoutRepository {
  attachResult = true;
  confirmResult = true;
  attached: Array<{ bookingId: string; sessionId: string }> = [];
  cancelled: Array<{ bookingId: string; reason: string }> = [];

  async attachCheckoutSession(bookingId: string, sessionId: string): Promise<boolean> {
    this.attached.push({ bookingId, sessionId });
    return this.attachResult;
  }
  async cancelPendingById(bookingId: string, reason: string): Promise<boolean> {
    this.cancelled.push({ bookingId, reason });
    return true;
  }
  async confirmFreeBooking(): Promise<boolean> {
    return this.confirmResult;
  }
}

let gateway: FakeStripeGateway;
let repository: FakeCheckoutRepository;
let rooms: InMemoryRoomRepository;
let room: Room;
let useCase: CreateBookingCheckoutUseCase;

function booking(totalInCents = 12_000): Booking {
  return Booking.create({
    companyId: COMPANY_ID,
    roomId: room.id,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    startsAt: new Date("2026-09-01T12:00:00.000Z"),
    endsAt: new Date("2026-09-01T13:00:00.000Z"),
    slotMinutes: 60,
    totalInCents,
    now: NOW,
  });
}

beforeEach(async () => {
  gateway = new FakeStripeGateway();
  repository = new FakeCheckoutRepository();
  rooms = new InMemoryRoomRepository();
  room = Room.create({
    companyId: COMPANY_ID,
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 12_000,
  });
  await rooms.create(room);
  useCase = new CreateBookingCheckoutUseCase(
    gateway,
    repository,
    rooms,
    new FixedClock(NOW),
    "https://meet-flow.example/",
  );
});

describe("CreateBookingCheckoutUseCase", () => {
  it("cobra exatamente o total calculado no servidor e anexa a sessão", async () => {
    const pending = booking();
    const result = await useCase.execute(pending, company);

    expect(result.checkout?.url).toBe("https://checkout.stripe.test/123");
    expect(result.booking.stripeCheckoutSessionId).toBe("cs_test_123");
    expect(gateway.bookingInputs[0]).toMatchObject({
      bookingId: pending.id,
      totalInCents: 12_000,
      customerEmail: "ana@exemplo.com",
      successUrl:
        "https://meet-flow.example/hotel-aurora/agendar/sucesso?session_id={CHECKOUT_SESSION_ID}",
    });
    expect(repository.attached).toEqual([{ bookingId: pending.id, sessionId: "cs_test_123" }]);
  });

  it("compensa falha da Stripe cancelando o hold", async () => {
    gateway.failure = new Error("network");
    const pending = booking();

    await expect(useCase.execute(pending, company)).rejects.toThrow(CheckoutUnavailableError);
    expect(repository.cancelled).toEqual([{ bookingId: pending.id, reason: "checkout_failed" }]);
  });

  it("expira a sessão e cancela o hold quando o attach condicional perde a corrida", async () => {
    repository.attachResult = false;
    const pending = booking();

    await expect(useCase.execute(pending, company)).rejects.toThrow(CheckoutUnavailableError);
    expect(gateway.expiredSessions).toContain("cs_test_123");
    expect(repository.cancelled.at(-1)).toEqual({
      bookingId: pending.id,
      reason: "checkout_failed",
    });
  });

  it("confirma reserva gratuita sem criar sessão Stripe", async () => {
    const free = booking(0);
    const result = await useCase.execute(free, company);

    expect(result.checkout).toBeNull();
    expect(result.booking.status).toBe(BookingStatus.CONFIRMED);
    expect(gateway.bookingInputs).toHaveLength(0);
  });
});
