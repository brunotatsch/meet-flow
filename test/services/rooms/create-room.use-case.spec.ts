import { beforeEach, describe, expect, it } from "vitest";
import {
  CreateRoomUseCase,
  type CreateRoomCommand,
} from "@services/rooms/application/create-room.use-case";
import { DuplicateRoomNameError } from "@services/rooms/domain/errors";
import { InMemoryRoomRepository } from "./in-memory-room.repository";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

let repository: InMemoryRoomRepository;
let useCase: CreateRoomUseCase;

function input(overrides: Partial<CreateRoomCommand> = {}): CreateRoomCommand {
  return {
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 15_000,
    ...overrides,
  };
}

beforeEach(() => {
  repository = new InMemoryRoomRepository();
  useCase = new CreateRoomUseCase(repository);
});

describe("CreateRoomUseCase", () => {
  it("cria a sala e a mantém recuperável pelo repositório", async () => {
    const room = await useCase.execute(COMPANY_A, input());

    const found = await repository.findById(room.id, COMPANY_A);
    expect(found?.name).toBe("Sala Atlântico");
    expect(found?.isActive).toBe(true);
  });

  it("rejeita nome já usado na mesma empresa com 409", async () => {
    await useCase.execute(COMPANY_A, input());

    await expect(useCase.execute(COMPANY_A, input())).rejects.toBeInstanceOf(
      DuplicateRoomNameError,
    );
  });

  it("permite o mesmo nome em empresas diferentes", async () => {
    await useCase.execute(COMPANY_A, input());

    await expect(useCase.execute(COMPANY_B, input())).resolves.toBeDefined();
  });
});
