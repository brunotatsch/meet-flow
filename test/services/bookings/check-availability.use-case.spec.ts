import { beforeEach, describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { AvailabilityResponseSchema } from "@shared/schemas/booking.schema";
import { CheckAvailabilityUseCase } from "@services/bookings/application/check-availability.use-case";
import { InvalidAvailabilityDateError } from "@services/bookings/domain/errors";
import { CompanyNotFoundError } from "@services/companies/domain/errors";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import { RoomSchedule } from "@services/rooms/domain/room-schedule.entity";
import { Room } from "@services/rooms/domain/room.entity";
import { RoomBlock } from "@services/room-blocks/domain/room-block.entity";
import { InMemoryCompanyRepository } from "../companies/in-memory-company.repository";
import { InMemoryRoomScheduleRepository } from "../rooms/in-memory-room-schedule.repository";
import { InMemoryRoomRepository } from "../rooms/in-memory-room.repository";
import { InMemoryRoomBlockRepository } from "../room-blocks/in-memory-room-block.repository";
import { FixedClock } from "./fixed-clock";
import { InMemoryBookingRepository } from "./in-memory-booking.repository";

/** 2026-09-01 é uma terça-feira (weekday 2). */
const TUESDAY = "2026-09-01";
const TUESDAY_WEEKDAY = 2;
const WEDNESDAY = "2026-09-02";

/** Bem antes de qualquer slot dos testes: nada é descartado por já ter começado. */
const BEFORE_EVERYTHING = new Date("2026-08-01T00:00:00Z");

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";

let companies: InMemoryCompanyRepository;
let rooms: InMemoryRoomRepository;
let schedules: InMemoryRoomScheduleRepository;
let bookings: InMemoryBookingRepository;
let blocks: InMemoryRoomBlockRepository;
let clock: FixedClock;
let useCase: CheckAvailabilityUseCase;
let room: Room;

function buildUseCase(): CheckAvailabilityUseCase {
  return new CheckAvailabilityUseCase(companies, rooms, schedules, bookings, blocks, clock);
}

async function scheduleTuesday(
  overrides: Partial<{ opensAt: string; closesAt: string; slotMinutes: number }> = {},
): Promise<void> {
  await schedules.replaceForRoom(room.id, [
    RoomSchedule.create({
      roomId: room.id,
      weekday: TUESDAY_WEEKDAY,
      opensAt: overrides.opensAt ?? "09:00:00",
      closesAt: overrides.closesAt ?? "12:00:00",
      slotMinutes: overrides.slotMinutes ?? 60,
    }),
  ]);
}

function bookedAt(
  startsAt: string,
  endsAt: string,
  status: BookingStatus = BookingStatus.CONFIRMED,
): void {
  bookings.add({
    companyId: COMPANY_ID,
    roomId: room.id,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status,
  });
}

beforeEach(async () => {
  companies = new InMemoryCompanyRepository();
  companies.add({
    id: COMPANY_ID,
    name: "Hotel Aurora",
    slug: "hotel-aurora",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  });

  rooms = new InMemoryRoomRepository();
  room = Room.create({
    companyId: COMPANY_ID,
    name: "Sala Atlântico",
    capacity: 10,
    hourlyRateInCents: 12_000,
  });
  await rooms.create(room);

  schedules = new InMemoryRoomScheduleRepository();
  bookings = new InMemoryBookingRepository();
  blocks = new InMemoryRoomBlockRepository();
  clock = new FixedClock(BEFORE_EVERYTHING);
  useCase = buildUseCase();
});

describe("CheckAvailabilityUseCase", () => {
  it("responde no formato do contrato compartilhado", async () => {
    await scheduleTuesday();

    const result = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(() => AvailabilityResponseSchema.parse(result)).not.toThrow();
    expect(result).toMatchObject({
      roomId: room.id,
      date: TUESDAY,
      timezone: "America/Sao_Paulo",
    });
  });

  it("monta a grade do dia no fuso da empresa, com preço proporcional ao slot", async () => {
    await scheduleTuesday({ slotMinutes: 30 });

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots).toHaveLength(6);
    expect(slots[0]).toEqual({
      startsAt: "2026-09-01T09:00:00-03:00",
      endsAt: "2026-09-01T09:30:00-03:00",
      available: true,
      priceInCents: 6_000,
    });
    expect(slots.at(-1)?.endsAt).toBe("2026-09-01T12:00:00-03:00");
  });

  it("trata dia sem agenda como indisponível, não como aberto o dia inteiro", async () => {
    await scheduleTuesday();

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: WEDNESDAY,
    });

    expect(slots).toEqual([]);
  });

  it("devolve grade vazia quando a sala não tem nenhuma agenda cadastrada", async () => {
    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots).toEqual([]);
  });

  it("marca todos os slots como indisponíveis no dia cheio", async () => {
    await scheduleTuesday();
    bookedAt("2026-09-01T12:00:00Z", "2026-09-01T15:00:00Z");

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => !slot.available)).toBe(true);
  });

  it("mantém disponível o que sobra no dia parcialmente ocupado", async () => {
    await scheduleTuesday();
    // 10:00 às 11:00 no horário de Brasília.
    bookedAt("2026-09-01T13:00:00Z", "2026-09-01T14:00:00Z");

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => [slot.startsAt, slot.available])).toEqual([
      ["2026-09-01T09:00:00-03:00", true],
      ["2026-09-01T10:00:00-03:00", false],
      ["2026-09-01T11:00:00-03:00", true],
    ]);
  });

  it("bloqueia o slot que colide apenas parcialmente com a reserva", async () => {
    await scheduleTuesday();
    // 10:30 às 10:45: pega metade do slot das 10h e nada dos vizinhos.
    bookedAt("2026-09-01T13:30:00Z", "2026-09-01T13:45:00Z");

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => slot.available)).toEqual([true, false, true]);
  });

  it("remove da disponibilidade pública os períodos bloqueados pela operação", async () => {
    await scheduleTuesday();
    await blocks.createSeries([
      RoomBlock.create({
        companyId: COMPANY_ID,
        roomId: room.id,
        startsAt: new Date("2026-09-01T13:30:00Z"),
        endsAt: new Date("2026-09-01T13:45:00Z"),
        reason: "Manutenção preventiva",
        createdBy: "operator-id",
      }),
    ]);

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => slot.available)).toEqual([true, false, true]);
  });

  it("libera o slot que apenas encosta no fim da reserva", async () => {
    await scheduleTuesday();
    // Termina exatamente às 10:00, quando o segundo slot começa.
    bookedAt("2026-09-01T12:00:00Z", "2026-09-01T13:00:00Z");

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => slot.available)).toEqual([false, true, true]);
  });

  it("ignora reserva cancelada", async () => {
    await scheduleTuesday();
    bookedAt("2026-09-01T13:00:00Z", "2026-09-01T14:00:00Z", BookingStatus.CANCELLED);

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it("conta a reserva que começou na véspera e invade a janela do dia", async () => {
    await scheduleTuesday({ opensAt: "00:00:00", closesAt: "03:00:00" });
    // 31/08 22:00 às 01/09 01:00 em Brasília.
    bookedAt("2026-09-01T01:00:00Z", "2026-09-01T04:00:00Z");

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => slot.available)).toEqual([false, true, true]);
  });

  it("descarta o slot que já começou e mantém o que ainda vai começar", async () => {
    await scheduleTuesday();
    // 10:15 em Brasília: o slot das 9h e o das 10h já começaram.
    clock.set(new Date("2026-09-01T13:15:00Z"));

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => slot.startsAt)).toEqual(["2026-09-01T11:00:00-03:00"]);
  });

  it("descarta o slot que começa exatamente agora", async () => {
    await scheduleTuesday();
    clock.set(new Date("2026-09-01T13:00:00Z"));

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots.map((slot) => slot.startsAt)).toEqual(["2026-09-01T11:00:00-03:00"]);
  });

  it("devolve grade vazia para um dia inteiramente no passado", async () => {
    await scheduleTuesday();
    clock.set(new Date("2026-09-02T00:00:00Z"));

    const { slots } = await useCase.execute({
      companyId: COMPANY_ID,
      roomId: room.id,
      date: TUESDAY,
    });

    expect(slots).toEqual([]);
  });

  it("recusa sala de outra empresa como se não existisse", async () => {
    companies.add({
      id: OTHER_COMPANY_ID,
      name: "Coworking Sul",
      slug: "coworking-sul",
      type: "coworking",
      timezone: "America/Sao_Paulo",
    });
    await scheduleTuesday();

    await expect(
      useCase.execute({ companyId: OTHER_COMPANY_ID, roomId: room.id, date: TUESDAY }),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it("recusa sala inativa", async () => {
    await scheduleTuesday();
    room.deactivate();
    await rooms.update(room);

    await expect(
      useCase.execute({ companyId: COMPANY_ID, roomId: room.id, date: TUESDAY }),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it("recusa empresa inexistente", async () => {
    await expect(
      useCase.execute({ companyId: OTHER_COMPANY_ID, roomId: room.id, date: TUESDAY }),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("recusa data malformada ou inexistente antes de tocar o banco", async () => {
    for (const date of ["01/09/2026", "2026-02-30"]) {
      await expect(
        useCase.execute({ companyId: COMPANY_ID, roomId: room.id, date }),
      ).rejects.toBeInstanceOf(InvalidAvailabilityDateError);
    }
  });

  describe("empresa em fuso com horário de verão", () => {
    const SUNDAY_SPRING_FORWARD = "2026-03-08";
    const SUNDAY_FALL_BACK = "2026-11-01";

    beforeEach(async () => {
      companies.add({
        id: COMPANY_ID,
        name: "Hotel Hudson",
        slug: "hotel-hudson",
        type: "hotel",
        timezone: "America/New_York",
      });

      await schedules.replaceForRoom(room.id, [
        RoomSchedule.create({
          roomId: room.id,
          weekday: 0,
          opensAt: "00:00:00",
          closesAt: "06:00:00",
          slotMinutes: 60,
        }),
      ]);

      clock.set(new Date("2026-01-01T00:00:00Z"));
      useCase = buildUseCase();
    });

    it("não duplica nem perde slots quando o relógio adianta", async () => {
      const { slots, timezone } = await useCase.execute({
        companyId: COMPANY_ID,
        roomId: room.id,
        date: SUNDAY_SPRING_FORWARD,
      });

      expect(timezone).toBe("America/New_York");
      expect(slots.map((slot) => slot.startsAt)).toEqual([
        "2026-03-08T00:00:00-05:00",
        "2026-03-08T01:00:00-05:00",
        "2026-03-08T03:00:00-04:00",
        "2026-03-08T04:00:00-04:00",
        "2026-03-08T05:00:00-04:00",
      ]);
    });

    it("não duplica nem perde slots quando o relógio atrasa", async () => {
      const { slots } = await useCase.execute({
        companyId: COMPANY_ID,
        roomId: room.id,
        date: SUNDAY_FALL_BACK,
      });

      expect(slots.map((slot) => slot.startsAt)).toEqual([
        "2026-11-01T00:00:00-04:00",
        "2026-11-01T01:00:00-04:00",
        "2026-11-01T01:00:00-05:00",
        "2026-11-01T02:00:00-05:00",
        "2026-11-01T03:00:00-05:00",
        "2026-11-01T04:00:00-05:00",
        "2026-11-01T05:00:00-05:00",
      ]);
    });

    it("bloqueia a ocorrência certa da hora repetida", async () => {
      // 01:00 EST, a segunda passagem pelas 01:00 do dia em que o relógio atrasa.
      bookedAt("2026-11-01T06:00:00Z", "2026-11-01T07:00:00Z");

      const { slots } = await useCase.execute({
        companyId: COMPANY_ID,
        roomId: room.id,
        date: SUNDAY_FALL_BACK,
      });

      expect(slots.map((slot) => [slot.startsAt, slot.available])).toEqual([
        ["2026-11-01T00:00:00-04:00", true],
        ["2026-11-01T01:00:00-04:00", true],
        ["2026-11-01T01:00:00-05:00", false],
        ["2026-11-01T02:00:00-05:00", true],
        ["2026-11-01T03:00:00-05:00", true],
        ["2026-11-01T04:00:00-05:00", true],
        ["2026-11-01T05:00:00-05:00", true],
      ]);
    });
  });
});
