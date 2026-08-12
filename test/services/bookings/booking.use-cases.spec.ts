import { beforeEach, describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { CancelBookingUseCase } from "@services/bookings/application/cancel-booking.use-case";
import { ListBookingsUseCase } from "@services/bookings/application/list-bookings.use-case";
import { BookingNotFoundError, InvalidBookingDataError } from "@services/bookings/domain/errors";
import { InMemoryBookingRepository } from "./in-memory-booking.repository";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const ROOM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ROOM_ID = "44444444-4444-4444-8444-444444444444";
const UNKNOWN_ID = "55555555-5555-4555-8555-555555555555";

const NINE = new Date("2026-09-01T12:00:00.000Z");
const TEN = new Date("2026-09-01T13:00:00.000Z");
const ELEVEN = new Date("2026-09-01T14:00:00.000Z");
const NOON = new Date("2026-09-01T15:00:00.000Z");
const NEXT_DAY = new Date("2026-09-02T12:00:00.000Z");
const NEXT_DAY_END = new Date("2026-09-02T13:00:00.000Z");

let bookings: InMemoryBookingRepository;
let cancelBooking: CancelBookingUseCase;
let listBookings: ListBookingsUseCase;

beforeEach(() => {
  bookings = new InMemoryBookingRepository();
  cancelBooking = new CancelBookingUseCase(bookings);
  listBookings = new ListBookingsUseCase(bookings);
});

describe("CancelBookingUseCase", () => {
  it("cancela a reserva da empresa autenticada", async () => {
    const booking = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NINE,
      endsAt: TEN,
    });

    const cancelled = await cancelBooking.execute(booking.id, COMPANY_ID);

    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    expect((await bookings.findById(booking.id, COMPANY_ID))?.status).toBe(BookingStatus.CANCELLED);
  });

  it("libera o horário para uma nova reserva", async () => {
    const booking = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NINE,
      endsAt: TEN,
    });
    await cancelBooking.execute(booking.id, COMPANY_ID);

    const replacement = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NINE,
      endsAt: TEN,
    });

    expect(await bookings.findById(replacement.id, COMPANY_ID)).not.toBeNull();
  });

  it("mantém a linha no histórico em vez de apagá-la", async () => {
    const booking = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NINE,
      endsAt: TEN,
    });

    await cancelBooking.execute(booking.id, COMPANY_ID);

    const listed = await listBookings.execute({ companyId: COMPANY_ID, from: NINE, to: NOON });
    expect(listed).toHaveLength(1);
  });

  it("recusa reserva inexistente", async () => {
    await expect(cancelBooking.execute(UNKNOWN_ID, COMPANY_ID)).rejects.toThrow(
      BookingNotFoundError,
    );
  });

  it("recusa reserva de outra empresa com o mesmo erro de reserva inexistente", async () => {
    const booking = bookings.add({
      companyId: OTHER_COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NINE,
      endsAt: TEN,
    });

    await expect(cancelBooking.execute(booking.id, COMPANY_ID)).rejects.toThrow(
      BookingNotFoundError,
    );
  });

  it("é idempotente para uma reserva já cancelada", async () => {
    const booking = bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NINE,
      endsAt: TEN,
    });

    await cancelBooking.execute(booking.id, COMPANY_ID);
    const again = await cancelBooking.execute(booking.id, COMPANY_ID);

    expect(again.status).toBe(BookingStatus.CANCELLED);
  });
});

describe("ListBookingsUseCase", () => {
  beforeEach(() => {
    bookings.add({ companyId: COMPANY_ID, roomId: ROOM_ID, startsAt: NINE, endsAt: TEN });
    bookings.add({ companyId: COMPANY_ID, roomId: OTHER_ROOM_ID, startsAt: TEN, endsAt: ELEVEN });
    bookings.add({
      companyId: COMPANY_ID,
      roomId: ROOM_ID,
      startsAt: NEXT_DAY,
      endsAt: NEXT_DAY_END,
    });
    bookings.add({ companyId: OTHER_COMPANY_ID, roomId: ROOM_ID, startsAt: NINE, endsAt: TEN });
  });

  it("lista só as reservas da empresa dentro do período", async () => {
    const listed = await listBookings.execute({ companyId: COMPANY_ID, from: NINE, to: NOON });

    expect(listed).toHaveLength(2);
    expect(listed.every((booking) => booking.companyId === COMPANY_ID)).toBe(true);
  });

  it("ordena por início", async () => {
    const listed = await listBookings.execute({
      companyId: COMPANY_ID,
      from: NINE,
      to: NEXT_DAY_END,
    });

    expect(listed.map((booking) => booking.startsAt)).toEqual([NINE, TEN, NEXT_DAY]);
  });

  it("filtra por sala quando pedido", async () => {
    const listed = await listBookings.execute({
      companyId: COMPANY_ID,
      from: NINE,
      to: NOON,
      roomId: OTHER_ROOM_ID,
    });

    expect(listed).toHaveLength(1);
    expect(listed[0]?.roomId).toBe(OTHER_ROOM_ID);
  });

  /**
   * Recorte por sobreposição, não por início dentro do intervalo: a reserva que
   * começou antes da janela e ainda está em curso ocupa a sala e precisa aparecer no
   * calendário do admin.
   */
  it("inclui reserva que começou antes do período e o cruza", async () => {
    const listed = await listBookings.execute({
      companyId: COMPANY_ID,
      from: new Date("2026-09-01T12:30:00.000Z"),
      to: new Date("2026-09-01T12:45:00.000Z"),
    });

    expect(listed).toHaveLength(1);
  });

  it("recusa período invertido", async () => {
    await expect(
      listBookings.execute({ companyId: COMPANY_ID, from: NOON, to: NINE }),
    ).rejects.toThrow(InvalidBookingDataError);
  });
});
