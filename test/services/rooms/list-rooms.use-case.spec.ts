import { beforeEach, describe, expect, it } from "vitest";
import { CreateRoomUseCase } from "@services/rooms/application/create-room.use-case";
import { ListRoomsUseCase } from "@services/rooms/application/list-rooms.use-case";
import { InMemoryRoomRepository } from "./in-memory-room.repository";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

let repository: InMemoryRoomRepository;
let createRoomUseCase: CreateRoomUseCase;
let useCase: ListRoomsUseCase;

beforeEach(async () => {
  repository = new InMemoryRoomRepository();
  createRoomUseCase = new CreateRoomUseCase(repository);
  useCase = new ListRoomsUseCase(repository);

  await createRoomUseCase.execute(COMPANY_A, {
    name: "Sala Pequena",
    capacity: 4,
    hourlyRateInCents: 5_000,
  });
  await createRoomUseCase.execute(COMPANY_A, {
    name: "Sala Grande",
    capacity: 20,
    hourlyRateInCents: 30_000,
  });
  await createRoomUseCase.execute(COMPANY_B, {
    name: "Sala Andes",
    capacity: 8,
    hourlyRateInCents: 9_000,
  });
});

describe("ListRoomsUseCase", () => {
  it("lista apenas as salas da empresa informada", async () => {
    const result = await useCase.execute(COMPANY_A);

    expect(result.map((room) => room.name).sort()).toEqual(["Sala Grande", "Sala Pequena"]);
  });

  it("filtra por capacidade mínima", async () => {
    const result = await useCase.execute(COMPANY_A, { minCapacity: 10 });

    expect(result.map((room) => room.name)).toEqual(["Sala Grande"]);
  });

  it("filtra por isActive", async () => {
    const [room] = await useCase.execute(COMPANY_A, { minCapacity: 10 });
    room!.deactivate();
    await repository.update(room!);

    const active = await useCase.execute(COMPANY_A, { isActive: true });
    const inactive = await useCase.execute(COMPANY_A, { isActive: false });

    expect(active.map((r) => r.name)).toEqual(["Sala Pequena"]);
    expect(inactive.map((r) => r.name)).toEqual(["Sala Grande"]);
  });
});
