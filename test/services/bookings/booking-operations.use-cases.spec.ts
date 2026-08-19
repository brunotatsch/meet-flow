import { beforeEach, describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { CheckInBookingUseCase } from "@services/bookings/application/check-in-booking.use-case";
import { CheckOutBookingUseCase } from "@services/bookings/application/check-out-booking.use-case";
import { CreateBookingUseCase } from "@services/bookings/application/create-booking.use-case";
import { MarkBookingNoShowUseCase } from "@services/bookings/application/mark-booking-no-show.use-case";
import { RescheduleBookingUseCase } from "@services/bookings/application/reschedule-booking.use-case";
import {
  BookingConflictError,
  BookingNotFoundError,
  CheckInOutsideWindowError,
  InvalidBookingDataError,
  InvalidBookingTransitionError,
} from "@services/bookings/domain/errors";
import { RoomSchedule } from "@services/rooms/domain/room-schedule.entity";
import { Room } from "@services/rooms/domain/room.entity";
import { InMemoryCompanyRepository } from "../companies/in-memory-company.repository";
import { InMemoryRoomScheduleRepository } from "../rooms/in-memory-room-schedule.repository";
import { InMemoryRoomRepository } from "../rooms/in-memory-room.repository";
import { FixedClock } from "./fixed-clock";
import { InMemoryBookingRepository } from "./in-memory-booking.repository";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "99999999-9999-4999-8999-999999999999";
const NINE = new Date("2026-09-01T12:00:00.000Z");
const TEN = new Date("2026-09-01T13:00:00.000Z");
const ELEVEN = new Date("2026-09-01T14:00:00.000Z");
const BEFORE = new Date("2026-08-01T00:00:00.000Z");

let companies: InMemoryCompanyRepository;
let rooms: InMemoryRoomRepository;
let schedules: InMemoryRoomScheduleRepository;
let bookings: InMemoryBookingRepository;
let clock: FixedClock;
let room: Room;
let createBooking: CreateBookingUseCase;

beforeEach(async () => {
  companies = new InMemoryCompanyRepository();
  companies.add({
    id: COMPANY_ID,
    name: "Hotel Aurora",
    slug: "hotel-aurora",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  });
  rooms = new InMemoryRoomRepository();
  room = Room.create({
    companyId: COMPANY_ID,
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 12_000,
  });
  await rooms.create(room);
  schedules = new InMemoryRoomScheduleRepository();
  await schedules.replaceForRoom(room.id, [
    RoomSchedule.create({
      roomId: room.id,
      weekday: 2,
      opensAt: "09:00",
      closesAt: "12:00",
      slotMinutes: 60,
    }),
  ]);
  bookings = new InMemoryBookingRepository();
  clock = new FixedClock(BEFORE);
  createBooking = new CreateBookingUseCase(companies, rooms, schedules, bookings, clock);
});

async function manual(startsAt = NINE, endsAt = TEN) {
  return createBooking.execute({
    companyId: COMPANY_ID,
    roomId: room.id,
    startsAt,
    endsAt,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    confirmationMode: "manual",
  });
}

describe("reserva manual", () => {
  it("reutiliza CreateBookingUseCase, calcula o preço e nasce confirmada sem hold", async () => {
    const booking = await manual();

    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(booking.totalInCents).toBe(12_000);
    expect(booking.expiresAt).toBeNull();
    expect(await bookings.findById(booking.id, COMPANY_ID)).toBe(booking);
  });

  it("continua sujeito à mesma arbitragem de conflito", async () => {
    await manual();
    await expect(manual()).rejects.toThrow(BookingConflictError);
  });
});

describe("RescheduleBookingUseCase", () => {
  function useCase() {
    return new RescheduleBookingUseCase(companies, rooms, schedules, bookings, clock);
  }

  it("move uma confirmada preservando duração, preço e tenant", async () => {
    const booking = await manual();
    const moved = await useCase().execute({
      id: booking.id,
      companyId: COMPANY_ID,
      startsAt: TEN,
      endsAt: ELEVEN,
    });

    expect(moved.startsAt).toEqual(TEN);
    expect(moved.endsAt).toEqual(ELEVEN);
    expect(moved.totalInCents).toBe(12_000);
  });

  it("não contorna a constraint: propaga conflito ao atualizar", async () => {
    const first = await manual();
    await manual(TEN, ELEVEN);

    await expect(
      useCase().execute({
        id: first.id,
        companyId: COMPANY_ID,
        startsAt: TEN,
        endsAt: ELEVEN,
      }),
    ).rejects.toThrow(BookingConflictError);
  });

  it("recusa mudança de duração e acesso por outro tenant", async () => {
    const booking = await manual();

    await expect(
      useCase().execute({
        id: booking.id,
        companyId: COMPANY_ID,
        startsAt: NINE,
        endsAt: ELEVEN,
      }),
    ).rejects.toThrow(InvalidBookingDataError);
    await expect(
      useCase().execute({
        id: booking.id,
        companyId: OTHER_COMPANY_ID,
        startsAt: TEN,
        endsAt: ELEVEN,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});

describe("check-in, check-out e não comparecimento", () => {
  it("exige confirmação explícita fora da janela e persiste o horário real", async () => {
    const booking = await manual();
    const checkIn = new CheckInBookingUseCase(bookings, clock);

    await expect(checkIn.execute(booking.id, COMPANY_ID, false)).rejects.toThrow(
      CheckInOutsideWindowError,
    );
    const checked = await checkIn.execute(booking.id, COMPANY_ID, true);

    expect(checked.checkedInAt).toEqual(BEFORE);
    expect(checked.status).toBe(BookingStatus.CONFIRMED);
  });

  it("conclui no check-out e registra ambos os horários reais", async () => {
    const booking = await manual();
    const checkIn = new CheckInBookingUseCase(bookings, clock);
    const checkOut = new CheckOutBookingUseCase(bookings, clock);
    clock.set(new Date("2026-09-01T12:15:00.000Z"));
    await checkIn.execute(booking.id, COMPANY_ID, false);
    clock.set(new Date("2026-09-01T12:45:00.000Z"));

    const completed = await checkOut.execute(booking.id, COMPANY_ID);

    expect(completed.status).toBe(BookingStatus.COMPLETED);
    expect(completed.checkedInAt).toEqual(new Date("2026-09-01T12:15:00.000Z"));
    expect(completed.checkedOutAt).toEqual(new Date("2026-09-01T12:45:00.000Z"));
  });

  it("recusa check-out sem check-in", async () => {
    const booking = await manual();
    await expect(
      new CheckOutBookingUseCase(bookings, clock).execute(booking.id, COMPANY_ID),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it("marca no_show apenas depois do início e o mantém distinto de cancelamento", async () => {
    const booking = await manual();
    const noShow = new MarkBookingNoShowUseCase(bookings, clock);
    await expect(noShow.execute(booking.id, COMPANY_ID)).rejects.toThrow(
      InvalidBookingTransitionError,
    );

    clock.set(NINE);
    const missed = await noShow.execute(booking.id, COMPANY_ID);

    expect(missed.status).toBe(BookingStatus.NO_SHOW);
    expect(missed.cancellationReason).toBeNull();
  });
});
