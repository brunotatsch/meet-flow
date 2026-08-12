import { beforeEach, describe, expect, it } from "vitest";
import { DeleteRoomScheduleUseCase } from "@services/rooms/application/delete-room-schedule.use-case";
import { ListRoomSchedulesUseCase } from "@services/rooms/application/list-room-schedules.use-case";
import {
  ReplaceRoomSchedulesUseCase,
  type RoomScheduleCommand,
} from "@services/rooms/application/replace-room-schedules.use-case";
import {
  DuplicateWeekdayScheduleError,
  InvalidRoomScheduleDataError,
  RoomNotFoundError,
  RoomScheduleNotFoundError,
} from "@services/rooms/domain/errors";
import { Room } from "@services/rooms/domain/room.entity";
import { InMemoryRoomScheduleRepository } from "./in-memory-room-schedule.repository";
import { InMemoryRoomRepository } from "./in-memory-room.repository";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

let rooms: InMemoryRoomRepository;
let schedules: InMemoryRoomScheduleRepository;
let list: ListRoomSchedulesUseCase;
let replace: ReplaceRoomSchedulesUseCase;
let remove: DeleteRoomScheduleUseCase;
let room: Room;

function week(...weekdays: number[]): RoomScheduleCommand[] {
  return weekdays.map((weekday) => ({
    weekday,
    opensAt: "09:00:00",
    closesAt: "18:00:00",
    slotMinutes: 60,
  }));
}

beforeEach(async () => {
  rooms = new InMemoryRoomRepository();
  schedules = new InMemoryRoomScheduleRepository();
  list = new ListRoomSchedulesUseCase(rooms, schedules);
  replace = new ReplaceRoomSchedulesUseCase(rooms, schedules);
  remove = new DeleteRoomScheduleUseCase(rooms, schedules);

  room = Room.create({
    companyId: COMPANY_A,
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 12_000,
  });
  await rooms.create(room);
});

describe("ReplaceRoomSchedulesUseCase", () => {
  it("grava a semana ordenada por dia", async () => {
    const saved = await replace.execute(room.id, COMPANY_A, week(5, 1, 3));

    expect(saved.map((schedule) => schedule.weekday)).toEqual([1, 3, 5]);
    expect(await schedules.listByRoom(room.id)).toHaveLength(3);
  });

  it("substitui a semana inteira, não acumula com a anterior", async () => {
    await replace.execute(room.id, COMPANY_A, week(1, 2, 3));

    const saved = await replace.execute(room.id, COMPANY_A, week(6));

    expect(saved.map((schedule) => schedule.weekday)).toEqual([6]);
    expect(await schedules.findByRoomAndWeekday(room.id, 1)).toBeNull();
  });

  it("aceita semana vazia, deixando a sala fechada todos os dias", async () => {
    await replace.execute(room.id, COMPANY_A, week(1));

    await replace.execute(room.id, COMPANY_A, []);

    expect(await schedules.listByRoom(room.id)).toEqual([]);
  });

  it("rejeita o mesmo dia da semana repetido", async () => {
    await expect(replace.execute(room.id, COMPANY_A, week(2, 2))).rejects.toBeInstanceOf(
      DuplicateWeekdayScheduleError,
    );
  });

  it("rejeita janela inválida sem tocar na agenda já gravada", async () => {
    await replace.execute(room.id, COMPANY_A, week(1));

    await expect(
      replace.execute(room.id, COMPANY_A, [
        { weekday: 2, opensAt: "18:00:00", closesAt: "09:00:00", slotMinutes: 60 },
      ]),
    ).rejects.toBeInstanceOf(InvalidRoomScheduleDataError);

    expect(await schedules.listByRoom(room.id)).toHaveLength(1);
  });

  it("recusa sala de outra empresa", async () => {
    await expect(replace.execute(room.id, COMPANY_B, week(1))).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });
});

describe("ListRoomSchedulesUseCase", () => {
  it("lista a semana da sala da empresa autenticada", async () => {
    await replace.execute(room.id, COMPANY_A, week(1, 4));

    const found = await list.execute(room.id, COMPANY_A);

    expect(found.map((schedule) => schedule.weekday)).toEqual([1, 4]);
  });

  it("devolve lista vazia para sala sem agenda", async () => {
    expect(await list.execute(room.id, COMPANY_A)).toEqual([]);
  });

  it("recusa sala de outra empresa", async () => {
    await expect(list.execute(room.id, COMPANY_B)).rejects.toBeInstanceOf(RoomNotFoundError);
  });
});

describe("DeleteRoomScheduleUseCase", () => {
  it("fecha um dia sem mexer no resto da semana", async () => {
    await replace.execute(room.id, COMPANY_A, week(1, 2, 3));

    await remove.execute(room.id, COMPANY_A, 2);

    const remaining = await schedules.listByRoom(room.id);
    expect(remaining.map((schedule) => schedule.weekday)).toEqual([1, 3]);
  });

  it("recusa dia que já está fechado", async () => {
    await replace.execute(room.id, COMPANY_A, week(1));

    await expect(remove.execute(room.id, COMPANY_A, 4)).rejects.toBeInstanceOf(
      RoomScheduleNotFoundError,
    );
  });

  it("recusa sala de outra empresa", async () => {
    await replace.execute(room.id, COMPANY_A, week(1));

    await expect(remove.execute(room.id, COMPANY_B, 1)).rejects.toBeInstanceOf(RoomNotFoundError);
    expect(await schedules.listByRoom(room.id)).toHaveLength(1);
  });
});
