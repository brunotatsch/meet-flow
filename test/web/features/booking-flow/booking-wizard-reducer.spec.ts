import { describe, expect, it } from "vitest";
import type { PublicRoomResponse } from "@shared/schemas/room.schema";
import {
  bookingWizardReducer,
  initialBookingWizardState,
  SLOT_CONFLICT_NOTICE,
  type BookingWizardState,
} from "@web/features/booking-flow/booking-wizard-reducer";

const room: PublicRoomResponse = {
  id: "room-1",
  name: "Sala Atlântico",
  description: null,
  capacity: 10,
  hourlyRateInCents: 12_000,
  amenities: [],
  photoUrl: null,
};

describe("bookingWizardReducer", () => {
  it("SELECT_ROOM avança para horario e limpa data/slot anteriores", () => {
    const withStaleSelection: BookingWizardState = {
      ...initialBookingWizardState,
      date: "2030-01-01",
      slot: { startsAt: "x", endsAt: "y", priceInCents: 1 },
    };

    const next = bookingWizardReducer(withStaleSelection, { type: "SELECT_ROOM", room });

    expect(next.step).toBe("horario");
    expect(next.room).toBe(room);
    expect(next.date).toBeNull();
    expect(next.slot).toBeNull();
  });

  it("SELECT_SLOT avança para dados", () => {
    const withRoom: BookingWizardState = { ...initialBookingWizardState, room };

    const next = bookingWizardReducer(withRoom, {
      type: "SELECT_SLOT",
      date: "2030-06-04",
      timezone: "America/Sao_Paulo",
      slot: {
        startsAt: "2030-06-04T09:00:00-03:00",
        endsAt: "2030-06-04T10:00:00-03:00",
        priceInCents: 12_000,
      },
    });

    expect(next.step).toBe("dados");
    expect(next.date).toBe("2030-06-04");
    expect(next.timezone).toBe("America/Sao_Paulo");
  });

  it("SUBMIT_CUSTOMER avança para revisao", () => {
    const next = bookingWizardReducer(initialBookingWizardState, {
      type: "SUBMIT_CUSTOMER",
      customer: { customerName: "Ana Prado", customerEmail: "ana@exemplo.com" },
    });

    expect(next.step).toBe("revisao");
    expect(next.customer).toEqual({ customerName: "Ana Prado", customerEmail: "ana@exemplo.com" });
  });

  it("BACK volta um passo na ordem navegável", () => {
    const atRevisao: BookingWizardState = { ...initialBookingWizardState, step: "revisao" };

    expect(bookingWizardReducer(atRevisao, { type: "BACK" }).step).toBe("dados");
  });

  it("BACK no primeiro passo não faz nada", () => {
    expect(bookingWizardReducer(initialBookingWizardState, { type: "BACK" }).step).toBe("sala");
  });

  it("SLOT_NO_LONGER_AVAILABLE volta para horario e limpa o slot (caso do 409)", () => {
    const atRevisao: BookingWizardState = {
      ...initialBookingWizardState,
      step: "revisao",
      room,
      slot: {
        startsAt: "2030-06-04T09:00:00-03:00",
        endsAt: "2030-06-04T10:00:00-03:00",
        priceInCents: 12_000,
      },
    };

    const next = bookingWizardReducer(atRevisao, { type: "SLOT_NO_LONGER_AVAILABLE" });

    expect(next.step).toBe("horario");
    expect(next.slot).toBeNull();
    expect(next.room).toBe(room); // a sala continua escolhida, só o horário caiu
    expect(next.notice).toBe(SLOT_CONFLICT_NOTICE);
  });

  it("HYDRATE mescla o estado parcial vindo da URL", () => {
    const next = bookingWizardReducer(initialBookingWizardState, {
      type: "HYDRATE",
      state: { step: "horario", room },
    });

    expect(next.step).toBe("horario");
    expect(next.room).toBe(room);
  });
});
