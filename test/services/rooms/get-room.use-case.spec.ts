import { beforeEach, describe, expect, it } from "vitest";
import { CreateRoomUseCase } from "@services/rooms/application/create-room.use-case";
import { GetRoomUseCase } from "@services/rooms/application/get-room.use-case";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import { InMemoryRoomRepository } from "./in-memory-room.repository";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

let repository: InMemoryRoomRepository;
let createRoomUseCase: CreateRoomUseCase;
let useCase: GetRoomUseCase;

beforeEach(() => {
  repository = new InMemoryRoomRepository();
  createRoomUseCase = new CreateRoomUseCase(repository);
  useCase = new GetRoomUseCase(repository);
});

describe("GetRoomUseCase", () => {
  it("retorna a sala quando ela pertence à empresa", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });

    const room = await useCase.execute(created.id, COMPANY_A);
    expect(room.id).toBe(created.id);
  });

  it("lança RoomNotFoundError ao buscar sala de outra empresa", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });

    await expect(useCase.execute(created.id, COMPANY_B)).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it("o repositório retorna null ao buscar id de sala de outra empresa", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });

    await expect(repository.findById(created.id, COMPANY_B)).resolves.toBeNull();
  });

  it("lança RoomNotFoundError para id inexistente", async () => {
    await expect(useCase.execute("does-not-exist", COMPANY_A)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });
});
