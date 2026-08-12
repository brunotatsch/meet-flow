import { describe, expect, it } from "vitest";
import { InvalidRoomScheduleDataError } from "@services/rooms/domain/errors";
import {
  RoomSchedule,
  type CreateRoomScheduleProps,
} from "@services/rooms/domain/room-schedule.entity";

const ROOM_ID = "33333333-3333-4333-8333-333333333333";

function props(overrides: Partial<CreateRoomScheduleProps> = {}): CreateRoomScheduleProps {
  return {
    roomId: ROOM_ID,
    weekday: 1,
    opensAt: "09:00:00",
    closesAt: "18:00:00",
    slotMinutes: 60,
    ...overrides,
  };
}

describe("RoomSchedule", () => {
  it("cria a janela com id próprio e horários normalizados", () => {
    const schedule = RoomSchedule.create(props({ opensAt: "09:00", closesAt: "18:00" }));

    expect(schedule.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(schedule.opensAt).toBe("09:00:00");
    expect(schedule.closesAt).toBe("18:00:00");
  });

  it("expõe a janela em minutos desde a meia-noite, como o motor de slots consome", () => {
    const schedule = RoomSchedule.create(props({ opensAt: "08:30:00", closesAt: "17:45:00" }));

    expect(schedule.opensAtMinutes).toBe(510);
    expect(schedule.closesAtMinutes).toBe(1_065);
  });

  it("rejeita fechamento anterior ou igual à abertura", () => {
    expect(() => RoomSchedule.create(props({ closesAt: "09:00:00" }))).toThrow(
      InvalidRoomScheduleDataError,
    );
    expect(() => RoomSchedule.create(props({ closesAt: "08:00:00" }))).toThrow(
      InvalidRoomScheduleDataError,
    );
  });

  it("rejeita weekday fora de 0..6", () => {
    for (const weekday of [-1, 7, 1.5]) {
      expect(() => RoomSchedule.create(props({ weekday }))).toThrow(InvalidRoomScheduleDataError);
    }
  });

  it("rejeita slotMinutes não positivo ou maior que um dia", () => {
    for (const slotMinutes of [0, -30, 1_441, 30.5]) {
      expect(() => RoomSchedule.create(props({ slotMinutes }))).toThrow(
        InvalidRoomScheduleDataError,
      );
    }
  });

  it("rejeita horário malformado", () => {
    for (const opensAt of ["9:00", "25:00:00", "09:60:00", "manhã", ""]) {
      expect(() => RoomSchedule.create(props({ opensAt }))).toThrow(InvalidRoomScheduleDataError);
    }
  });

  it("rejeita segundo diferente de zero em vez de truncá-lo em silêncio", () => {
    expect(() => RoomSchedule.create(props({ opensAt: "09:00:30" }))).toThrow(/segundos zerados/);
  });

  it("valida as mesmas invariantes ao reidratar do banco", () => {
    expect(() =>
      RoomSchedule.restore({
        id: "44444444-4444-4444-8444-444444444444",
        roomId: ROOM_ID,
        weekday: 9,
        opensAt: "09:00:00",
        closesAt: "18:00:00",
        slotMinutes: 60,
      }),
    ).toThrow(InvalidRoomScheduleDataError);
  });
});
