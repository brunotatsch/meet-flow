import { beforeEach, describe, expect, it } from "vitest";
import { CreateRoomUseCase } from "@services/rooms/application/create-room.use-case";
import { UpdateRoomUseCase } from "@services/rooms/application/update-room.use-case";
import { DuplicateRoomNameError, RoomNotFoundError } from "@services/rooms/domain/errors";
import { InMemoryRoomRepository } from "./in-memory-room.repository";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

let repository: InMemoryRoomRepository;
let createRoomUseCase: CreateRoomUseCase;
let useCase: UpdateRoomUseCase;

beforeEach(() => {
  repository = new InMemoryRoomRepository();
  createRoomUseCase = new CreateRoomUseCase(repository);
  useCase = new UpdateRoomUseCase(repository);
});

describe("UpdateRoomUseCase", () => {
  it("atualiza apenas os campos informados", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });

    const updated = await useCase.execute(created.id, COMPANY_A, { capacity: 20 });

    expect(updated.capacity).toBe(20);
    expect(updated.name).toBe("Sala Atlântico");
    expect(updated.hourlyRateInCents).toBe(15_000);
  });

  it("lança RoomNotFoundError para sala de outra empresa", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });

    await expect(useCase.execute(created.id, COMPANY_B, { capacity: 20 })).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  it("rejeita renomear para um nome já usado na mesma empresa", async () => {
    await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });
    const other = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Pacífico",
      capacity: 6,
      hourlyRateInCents: 12_000,
    });

    await expect(
      useCase.execute(other.id, COMPANY_A, { name: "Sala Atlântico" }),
    ).rejects.toBeInstanceOf(DuplicateRoomNameError);
  });

  it("reativa a sala quando isActive é enviado como true", async () => {
    const created = await createRoomUseCase.execute(COMPANY_A, {
      name: "Sala Atlântico",
      capacity: 10,
      hourlyRateInCents: 15_000,
    });
    created.deactivate();
    await repository.update(created);

    const updated = await useCase.execute(created.id, COMPANY_A, { isActive: true });

    expect(updated.isActive).toBe(true);
  });
});
