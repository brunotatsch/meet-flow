import { beforeEach, describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { CreateBookingUseCase } from "@services/bookings/application/create-booking.use-case";
import {
  BookingConflictError,
  BookingInThePastError,
  OutsideBusinessHoursError,
  RoomNotAvailableError,
  SlotNotAlignedError,
} from "@services/bookings/domain/errors";
import { CompanyNotFoundError } from "@services/companies/domain/errors";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import { RoomSchedule } from "@services/rooms/domain/room-schedule.entity";
import { Room } from "@services/rooms/domain/room.entity";
import { InMemoryCompanyRepository } from "../companies/in-memory-company.repository";
import { InMemoryRoomScheduleRepository } from "../rooms/in-memory-room-schedule.repository";
import { InMemoryRoomRepository } from "../rooms/in-memory-room.repository";
import { FixedClock } from "./fixed-clock";
import { InMemoryBookingRepository } from "./in-memory-booking.repository";

/**
 * 2026-09-01 é terça e 2026-09-07 é segunda. A sala de São Paulo abre das 09:00 às
 * 12:00 na terça, o que em UTC-3 vira 12:00Z-15:00Z.
 */
const TUESDAY_WEEKDAY = 2;
const MONDAY_WEEKDAY = 1;
const NINE = new Date("2026-09-01T12:00:00.000Z");
const TEN = new Date("2026-09-01T13:00:00.000Z");
const ELEVEN = new Date("2026-09-01T14:00:00.000Z");
const NOON = new Date("2026-09-01T15:00:00.000Z");

/** Bem antes de qualquer horário dos testes: nada é recusado por já ter começado. */
const BEFORE_EVERYTHING = new Date("2026-08-01T00:00:00.000Z");

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

let companies: InMemoryCompanyRepository;
let rooms: InMemoryRoomRepository;
let schedules: InMemoryRoomScheduleRepository;
let bookings: InMemoryBookingRepository;
let clock: FixedClock;
let useCase: CreateBookingUseCase;
let room: Room;

function command(overrides: Partial<Parameters<CreateBookingUseCase["execute"]>[0]> = {}) {
  return {
    companyId: COMPANY_ID,
    roomId: room.id,
    startsAt: NINE,
    endsAt: TEN,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    ...overrides,
  };
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
  await schedules.replaceForRoom(room.id, [
    RoomSchedule.create({
      roomId: room.id,
      weekday: TUESDAY_WEEKDAY,
      opensAt: "09:00:00",
      closesAt: "12:00:00",
      slotMinutes: 60,
    }),
  ]);

  bookings = new InMemoryBookingRepository();
  clock = new FixedClock(BEFORE_EVERYTHING);
  useCase = new CreateBookingUseCase(companies, rooms, schedules, bookings, clock);
});

describe("CreateBookingUseCase", () => {
  it("cria a reserva confirmada e a persiste", async () => {
    const booking = await useCase.execute(command());

    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(booking.companyId).toBe(COMPANY_ID);
    expect(booking.roomId).toBe(room.id);
    expect(await bookings.findById(booking.id, COMPANY_ID)).not.toBeNull();
  });

  it("guarda os dados de contato e as observações do cliente", async () => {
    const booking = await useCase.execute(
      command({ customerPhone: "+55 51 99999-0000", notes: "Preciso de projetor." }),
    );

    expect(booking.customerName).toBe("Ana Prado");
    expect(booking.customerEmail).toBe("ana@exemplo.com");
    expect(booking.customerPhone).toBe("+55 51 99999-0000");
    expect(booking.notes).toBe("Preciso de projetor.");
  });

  describe("preço", () => {
    it("calcula o total no servidor a partir da tarifa da sala", async () => {
      const booking = await useCase.execute(command());

      expect(booking.totalInCents).toBe(12_000);
    });

    it("cobra um múltiplo do preço do slot para reservas mais longas", async () => {
      const booking = await useCase.execute(command({ startsAt: NINE, endsAt: ELEVEN }));

      expect(booking.totalInCents).toBe(24_000);
    });

    it("usa a grade do dia, não a duração cheia, quando o slot é de 30 minutos", async () => {
      await schedules.replaceForRoom(room.id, [
        RoomSchedule.create({
          roomId: room.id,
          weekday: TUESDAY_WEEKDAY,
          opensAt: "09:00:00",
          closesAt: "12:00:00",
          slotMinutes: 30,
        }),
      ]);

      const booking = await useCase.execute(
        command({ startsAt: NINE, endsAt: new Date("2026-09-01T12:30:00.000Z") }),
      );

      expect(booking.totalInCents).toBe(6_000);
    });
  });

  describe("sala", () => {
    it("recusa sala inexistente", async () => {
      await expect(useCase.execute(command({ roomId: UNKNOWN_ID }))).rejects.toThrow(
        RoomNotFoundError,
      );
    });

    it("recusa sala de outra empresa com o mesmo erro de sala inexistente", async () => {
      companies.add({
        id: OTHER_COMPANY_ID,
        name: "Coworking Sul",
        slug: "coworking-sul",
        type: "coworking",
        timezone: "America/Sao_Paulo",
      });

      await expect(useCase.execute(command({ companyId: OTHER_COMPANY_ID }))).rejects.toThrow(
        RoomNotFoundError,
      );
    });

    it("recusa sala inativa", async () => {
      room.deactivate();
      await rooms.update(room);

      await expect(useCase.execute(command())).rejects.toThrow(RoomNotAvailableError);
    });

    it("recusa empresa inexistente", async () => {
      await expect(useCase.execute(command({ companyId: UNKNOWN_ID }))).rejects.toThrow(
        CompanyNotFoundError,
      );
    });
  });

  describe("janela de funcionamento", () => {
    it("recusa dia da semana sem agenda cadastrada", async () => {
      await expect(
        useCase.execute(
          command({
            startsAt: new Date("2026-09-02T12:00:00.000Z"),
            endsAt: new Date("2026-09-02T13:00:00.000Z"),
          }),
        ),
      ).rejects.toThrow(OutsideBusinessHoursError);
    });

    it("recusa horário antes da abertura", async () => {
      await expect(
        useCase.execute(command({ startsAt: new Date("2026-09-01T11:00:00.000Z"), endsAt: NINE })),
      ).rejects.toThrow(OutsideBusinessHoursError);
    });

    it("recusa horário que passa do fechamento", async () => {
      await expect(
        useCase.execute(command({ startsAt: NOON, endsAt: new Date("2026-09-01T16:00:00.000Z") })),
      ).rejects.toThrow(OutsideBusinessHoursError);
    });

    it("recusa início fora das bordas da grade", async () => {
      await expect(
        useCase.execute(
          command({
            startsAt: new Date("2026-09-01T12:30:00.000Z"),
            endsAt: new Date("2026-09-01T13:30:00.000Z"),
          }),
        ),
      ).rejects.toThrow(SlotNotAlignedError);
    });

    it("recusa duração que não é múltipla do slot", async () => {
      await expect(
        useCase.execute(command({ startsAt: NINE, endsAt: new Date("2026-09-01T12:30:00.000Z") })),
      ).rejects.toThrow(SlotNotAlignedError);
    });

    /**
     * 21:00 de segunda em Nova York é terça em UTC. Ler o dia da semana do instante
     * bruto puxaria a agenda do dia seguinte e recusaria uma reserva legítima.
     */
    it("lê o dia da semana no fuso da empresa, não em UTC", async () => {
      companies.add({
        id: OTHER_COMPANY_ID,
        name: "Coworking Manhattan",
        slug: "coworking-manhattan",
        type: "coworking",
        timezone: "America/New_York",
      });

      const nightRoom = Room.create({
        companyId: OTHER_COMPANY_ID,
        name: "Sala Hudson",
        capacity: 6,
        hourlyRateInCents: 10_000,
      });
      await rooms.create(nightRoom);
      await schedules.replaceForRoom(nightRoom.id, [
        RoomSchedule.create({
          roomId: nightRoom.id,
          weekday: MONDAY_WEEKDAY,
          opensAt: "20:00:00",
          closesAt: "23:00:00",
          slotMinutes: 60,
        }),
      ]);

      const booking = await useCase.execute(
        command({
          companyId: OTHER_COMPANY_ID,
          roomId: nightRoom.id,
          startsAt: new Date("2026-09-08T01:00:00.000Z"),
          endsAt: new Date("2026-09-08T02:00:00.000Z"),
        }),
      );

      expect(booking.totalInCents).toBe(10_000);
    });
  });

  describe("horário no passado", () => {
    it("recusa reserva que já começou", async () => {
      clock.set(new Date("2026-09-01T12:30:00.000Z"));

      await expect(useCase.execute(command())).rejects.toThrow(BookingInThePastError);
    });

    it("recusa reserva que começa exatamente agora, como a grade faz", async () => {
      clock.set(NINE);

      await expect(useCase.execute(command())).rejects.toThrow(BookingInThePastError);
    });
  });

  describe("conflito de horário", () => {
    it("propaga o conflito decidido pelo repositório", async () => {
      await useCase.execute(command());

      await expect(useCase.execute(command())).rejects.toThrow(BookingConflictError);
    });

    it("recusa sobreposição parcial", async () => {
      await useCase.execute(command({ startsAt: NINE, endsAt: ELEVEN }));

      await expect(useCase.execute(command({ startsAt: TEN, endsAt: NOON }))).rejects.toThrow(
        BookingConflictError,
      );
    });

    it("aceita reserva encostada na anterior, pelo intervalo semiaberto", async () => {
      await useCase.execute(command({ startsAt: NINE, endsAt: TEN }));

      const booking = await useCase.execute(command({ startsAt: TEN, endsAt: ELEVEN }));

      expect(booking.startsAt).toEqual(TEN);
    });

    it("não considera reserva cancelada como ocupação", async () => {
      const first = await useCase.execute(command());
      first.cancel();
      await bookings.update(first);

      const second = await useCase.execute(command());

      expect(second.id).not.toBe(first.id);
    });

    it("permite o mesmo horário em salas diferentes", async () => {
      const sibling = Room.create({
        companyId: COMPANY_ID,
        name: "Sala Pacífico",
        capacity: 4,
        hourlyRateInCents: 8_000,
      });
      await rooms.create(sibling);
      await schedules.replaceForRoom(sibling.id, [
        RoomSchedule.create({
          roomId: sibling.id,
          weekday: TUESDAY_WEEKDAY,
          opensAt: "09:00:00",
          closesAt: "12:00:00",
          slotMinutes: 60,
        }),
      ]);

      await useCase.execute(command());
      const booking = await useCase.execute(command({ roomId: sibling.id }));

      expect(booking.totalInCents).toBe(8_000);
    });
  });
});
