import { describe, expect, it } from "vitest";
import {
  CreateRoomSchema,
  RoomFiltersSchema,
  RoomResponseSchema,
  UpdateRoomSchema,
} from "@shared/schemas/room.schema";

const validRoom = {
  name: "Sala Executiva",
  capacity: 8,
  hourlyRateInCents: 5000,
};

describe("CreateRoomSchema", () => {
  it("aceita um payload válido e aplica default de amenities", () => {
    const result = CreateRoomSchema.parse(validRoom);

    expect(result.amenities).toEqual([]);
  });

  it("rejeita capacity zero", () => {
    expect(() => CreateRoomSchema.parse({ ...validRoom, capacity: 0 })).toThrow();
  });

  it("rejeita capacity negativa", () => {
    expect(() => CreateRoomSchema.parse({ ...validRoom, capacity: -1 })).toThrow();
  });

  it("rejeita name com menos de 3 caracteres", () => {
    expect(() => CreateRoomSchema.parse({ ...validRoom, name: "ab" })).toThrow();
  });

  it("rejeita name com mais de 100 caracteres", () => {
    expect(() => CreateRoomSchema.parse({ ...validRoom, name: "a".repeat(101) })).toThrow();
  });

  it("rejeita hourlyRateInCents negativo", () => {
    expect(() => CreateRoomSchema.parse({ ...validRoom, hourlyRateInCents: -1 })).toThrow();
  });
});

describe("UpdateRoomSchema", () => {
  it("aceita um payload parcial vazio", () => {
    expect(() => UpdateRoomSchema.parse({})).not.toThrow();
  });

  it("aceita isActive isoladamente", () => {
    const result = UpdateRoomSchema.parse({ isActive: false });

    expect(result.isActive).toBe(false);
  });

  it("rejeita capacity inválida mesmo em update parcial", () => {
    expect(() => UpdateRoomSchema.parse({ capacity: 0 })).toThrow();
  });
});

describe("RoomFiltersSchema", () => {
  it("aceita filtros vazios", () => {
    expect(() => RoomFiltersSchema.parse({})).not.toThrow();
  });

  it("rejeita minCapacity não positivo", () => {
    expect(() => RoomFiltersSchema.parse({ minCapacity: 0 })).toThrow();
  });
});

describe("RoomResponseSchema", () => {
  it("aceita um payload de resposta completo", () => {
    const response = {
      id: "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e6f",
      companyId: "5f6a1e2a-8c1a-4e1a-9c1a-1a2b3c4d5e70",
      name: "Sala Executiva",
      description: null,
      capacity: 8,
      hourlyRateInCents: 5000,
      amenities: [],
      photoUrl: null,
      isActive: true,
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:00.000Z",
    };

    expect(() => RoomResponseSchema.parse(response)).not.toThrow();
  });
});
