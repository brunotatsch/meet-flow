import { describe, expect, it } from "vitest";
import { RoomScheduleSchema } from "@shared/schemas/schedule.schema";

const validSchedule = {
  weekday: 1,
  opensAt: "08:00:00",
  closesAt: "18:00:00",
  slotMinutes: 60,
};

describe("RoomScheduleSchema", () => {
  it("aceita um payload válido", () => {
    expect(() => RoomScheduleSchema.parse(validSchedule)).not.toThrow();
  });

  it("rejeita closesAt igual a opensAt", () => {
    expect(() =>
      RoomScheduleSchema.parse({ ...validSchedule, closesAt: validSchedule.opensAt }),
    ).toThrow();
  });

  it("rejeita closesAt anterior a opensAt", () => {
    expect(() =>
      RoomScheduleSchema.parse({ ...validSchedule, opensAt: "18:00:00", closesAt: "08:00:00" }),
    ).toThrow();
  });

  it("rejeita weekday fora de 0..6", () => {
    expect(() => RoomScheduleSchema.parse({ ...validSchedule, weekday: 7 })).toThrow();
  });

  it.each([15, 30, 60, 120])("aceita slotMinutes = %i", (slotMinutes) => {
    expect(() => RoomScheduleSchema.parse({ ...validSchedule, slotMinutes })).not.toThrow();
  });

  it("rejeita slotMinutes fora de [15, 30, 60, 120]", () => {
    expect(() => RoomScheduleSchema.parse({ ...validSchedule, slotMinutes: 45 })).toThrow();
  });
});
