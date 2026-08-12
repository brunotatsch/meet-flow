import { beforeEach, describe, expect, it } from "vitest";
import { CreateRoomUseCase } from "@services/rooms/application/create-room.use-case";
import { DeactivateRoomUseCase } from "@services/rooms/application/deactivate-room.use-case";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import { InMemoryRoomRepository } from "./in-memory-room.repository";

const COMPANY_A = "company-a";

let repository: InMemoryRoomRepository;
let createRoomUseCase: CreateRoomUseCase;
let useCase: DeactivateRoomUseCase;

beforeEach(() => {
  repository = new InMemoryRoomRepository();
  createRoomUseCase = new CreateRoomUseCase(repository);
  useCase = new DeactivateRoomUseCase(repository);
});

describe("DeactivateRoomUseCase", () => {
  it("marca a sala como inativa e persiste a mudança", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });

    const deactivated = await useCase.execute(created.id, COMPANY_A);

    expect(deactivated.isActive).toBe(false);
    const found = await repository.findById(created.id, COMPANY_A);
    expect(found?.isActive).toBe(false);
  });

  it("lança RoomNotFoundError para sala inexistente", async () => {
    await expect(useCase.execute("does-not-exist", COMPANY_A)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });
});
