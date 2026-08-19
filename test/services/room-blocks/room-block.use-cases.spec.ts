import { describe, expect, it } from "vitest";
import { CreateRoomBlocksUseCase } from "@services/room-blocks/application/create-room-blocks.use-case";
import { DeleteRoomBlockUseCase } from "@services/room-blocks/application/delete-room-block.use-case";
import { ListRoomBlocksUseCase } from "@services/room-blocks/application/list-room-blocks.use-case";
import {
  InvalidRoomBlockDataError,
  RoomBlockNotFoundError,
} from "@services/room-blocks/domain/errors";
import { Room } from "@services/rooms/domain/room.entity";
import { InMemoryCompanyRepository } from "../companies/in-memory-company.repository";
import { InMemoryRoomRepository } from "../rooms/in-memory-room.repository";
import { InMemoryRoomBlockRepository } from "./in-memory-room-block.repository";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

function setup(timezone = "America/Sao_Paulo") {
  const companies = new InMemoryCompanyRepository();
  companies.add({
    id: COMPANY_ID,
    name: "Hotel Aurora",
    slug: "hotel-aurora",
    type: "hotel",
    timezone,
  });
  const rooms = new InMemoryRoomRepository();
  const room = Room.create({
    companyId: COMPANY_ID,
    name: "Sala Aurora",
    capacity: 8,
    hourlyRateInCents: 10_000,
  });
  void rooms.create(room);
  const blocks = new InMemoryRoomBlockRepository();

  return {
    room,
    blocks,
    create: new CreateRoomBlocksUseCase(companies, rooms, blocks),
    list: new ListRoomBlocksUseCase(companies, blocks),
    remove: new DeleteRoomBlockUseCase(blocks),
  };
}

const baseCommand = {
  companyId: COMPANY_ID,
  createdBy: "user-1",
  date: "2026-03-07",
  startTime: "12:00",
  endTime: "13:00",
  reason: "Almoço da equipe",
} as const;

describe("room block use cases", () => {
  it("cria um bloqueio único no fuso da empresa", async () => {
    const context = setup();
    const result = await context.create.execute({ ...baseCommand, roomId: context.room.id });

    expect(result.timezone).toBe("America/Sao_Paulo");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.startsAt.toISOString()).toBe("2026-03-07T15:00:00.000Z");
    expect(result.blocks[0]?.recurrenceGroupId).toBeNull();
  });

  it("preserva horário de parede numa recorrência diária que cruza o DST", async () => {
    const context = setup("America/New_York");
    const result = await context.create.execute({
      ...baseCommand,
      roomId: context.room.id,
      recurrence: { frequency: "daily", until: "2026-03-09" },
    });

    expect(result.blocks.map((block) => block.startsAt.toISOString())).toEqual([
      "2026-03-07T17:00:00.000Z",
      "2026-03-08T16:00:00.000Z",
      "2026-03-09T16:00:00.000Z",
    ]);
    expect(new Set(result.blocks.map((block) => block.recurrenceGroupId)).size).toBe(1);
  });

  it("materializa recorrência semanal apenas no mesmo dia da semana", async () => {
    const context = setup();
    const result = await context.create.execute({
      ...baseCommand,
      roomId: context.room.id,
      recurrence: { frequency: "weekly", until: "2026-03-28" },
    });

    expect(result.blocks).toHaveLength(4);
    expect(result.blocks.map((block) => block.startsAt.getUTCDate())).toEqual([7, 14, 21, 28]);
  });

  it("limita a recorrência a um horizonte de 366 dias", async () => {
    const context = setup();

    await expect(
      context.create.execute({
        ...baseCommand,
        roomId: context.room.id,
        recurrence: { frequency: "daily", until: "2027-03-09" },
      }),
    ).rejects.toBeInstanceOf(InvalidRoomBlockDataError);
  });

  it("lista apenas intervalos que cruzam o período e a sala pedidos", async () => {
    const context = setup();
    await context.create.execute({ ...baseCommand, roomId: context.room.id });

    const result = await context.list.execute({
      companyId: COMPANY_ID,
      roomId: context.room.id,
      from: new Date("2026-03-07T14:00:00.000Z"),
      to: new Date("2026-03-07T16:00:00.000Z"),
    });

    expect(result.blocks).toHaveLength(1);
    expect(
      await context.blocks.listBlockedPeriods(
        COMPANY_ID,
        context.room.id,
        new Date("2026-03-07T14:00:00Z"),
        new Date("2026-03-07T16:00:00Z"),
      ),
    ).toHaveLength(1);
  });

  it("remove a série inteira ou só uma ocorrência", async () => {
    const context = setup();
    const created = await context.create.execute({
      ...baseCommand,
      roomId: context.room.id,
      recurrence: { frequency: "daily", until: "2026-03-09" },
    });

    await context.remove.execute(created.blocks[0]!.id, COMPANY_ID, "occurrence");
    expect(context.blocks.items).toHaveLength(2);
    await context.remove.execute(created.blocks[1]!.id, COMPANY_ID, "series");
    expect(context.blocks.items).toHaveLength(0);
  });

  it("não revela bloqueio de outro tenant na remoção", async () => {
    const context = setup();
    const created = await context.create.execute({ ...baseCommand, roomId: context.room.id });

    await expect(
      context.remove.execute(
        created.blocks[0]!.id,
        "22222222-2222-4222-8222-222222222222",
        "occurrence",
      ),
    ).rejects.toBeInstanceOf(RoomBlockNotFoundError);
  });
});
