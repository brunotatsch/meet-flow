import { describe, expect, it } from "vitest";
import { InvalidRoomDataError } from "@services/rooms/domain/errors";
import { type CreateRoomProps, Room } from "@services/rooms/domain/room.entity";

function validInput(overrides: Partial<CreateRoomProps> = {}): CreateRoomProps {
  return {
    companyId: "company-a",
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 15_000,
    ...overrides,
  };
}

describe("Room", () => {
  it("cria uma sala ativa com os valores padrão", () => {
    const room = Room.create(validInput());

    expect(room.isActive).toBe(true);
    expect(room.amenities).toEqual([]);
    expect(room.description).toBeNull();
    expect(room.photoUrl).toBeNull();
  });

  it("rejeita nome com menos de 3 caracteres", () => {
    expect(() => Room.create(validInput({ name: "ab" }))).toThrow(InvalidRoomDataError);
  });

  it("rejeita nome com mais de 100 caracteres", () => {
    expect(() => Room.create(validInput({ name: "a".repeat(101) }))).toThrow(InvalidRoomDataError);
  });

  it("rejeita capacidade não positiva", () => {
    expect(() => Room.create(validInput({ capacity: 0 }))).toThrow(InvalidRoomDataError);
  });

  it("rejeita tarifa horária negativa", () => {
    expect(() => Room.create(validInput({ hourlyRateInCents: -1 }))).toThrow(InvalidRoomDataError);
  });

  it("rename valida o novo nome", () => {
    const room = Room.create(validInput());

    expect(() => room.rename("ab")).toThrow(InvalidRoomDataError);
    room.rename("Sala Pacífico");
    expect(room.name).toBe("Sala Pacífico");
  });

  it("changeCapacity valida a nova capacidade", () => {
    const room = Room.create(validInput());

    expect(() => room.changeCapacity(-5)).toThrow(InvalidRoomDataError);
    room.changeCapacity(50);
    expect(room.capacity).toBe(50);
  });

  it("deactivate marca a sala como inativa", () => {
    const room = Room.create(validInput());

    room.deactivate();
    expect(room.isActive).toBe(false);
  });
});
