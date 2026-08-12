import { describe, expect, it } from "vitest";
import { BookingStatus } from "@shared/enums/booking-status";
import { Booking, type CreateBookingProps } from "@services/bookings/domain/booking.entity";
import { InvalidBookingDataError } from "@services/bookings/domain/errors";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";

const NINE = new Date("2026-09-01T12:00:00.000Z");
const TEN = new Date("2026-09-01T13:00:00.000Z");

function create(overrides: Partial<CreateBookingProps> = {}): Booking {
  return Booking.create({
    companyId: COMPANY_ID,
    roomId: ROOM_ID,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    startsAt: NINE,
    endsAt: TEN,
    slotMinutes: 60,
    totalInCents: 12_000,
    ...overrides,
  });
}

describe("Booking.create", () => {
  it("nasce confirmada, porque o MVP ainda não tem etapa de pagamento", () => {
    expect(create().status).toBe(BookingStatus.CONFIRMED);
  });

  it("preenche id, carimbos e os opcionais ausentes", () => {
    const booking = create();

    expect(booking.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(booking.customerPhone).toBeNull();
    expect(booking.notes).toBeNull();
    expect(booking.createdAt).toBeInstanceOf(Date);
    expect(booking.updatedAt).toEqual(booking.createdAt);
  });

  it("recusa endsAt igual ou anterior a startsAt", () => {
    expect(() => create({ endsAt: NINE })).toThrow(InvalidBookingDataError);
    expect(() => create({ startsAt: TEN, endsAt: NINE })).toThrow(InvalidBookingDataError);
  });

  it("aceita duração múltipla do slot da sala", () => {
    const booking = create({ endsAt: new Date("2026-09-01T14:00:00.000Z"), slotMinutes: 60 });

    expect(booking.durationInMinutes).toBe(120);
  });

  it("recusa duração que não é múltipla do slot da sala", () => {
    expect(() => create({ endsAt: new Date("2026-09-01T13:30:00.000Z"), slotMinutes: 60 })).toThrow(
      InvalidBookingDataError,
    );
  });

  it("recusa slotMinutes inválido em vez de dividir por zero", () => {
    expect(() => create({ slotMinutes: 0 })).toThrow(InvalidBookingDataError);
  });

  it("normaliza nome e e-mail com espaço em volta", () => {
    const booking = create({ customerName: "  Ana Prado  ", customerEmail: " ana@exemplo.com " });

    expect(booking.customerName).toBe("Ana Prado");
    expect(booking.customerEmail).toBe("ana@exemplo.com");
  });

  it("recusa nome curto demais e e-mail sem formato utilizável", () => {
    expect(() => create({ customerName: "An" })).toThrow(InvalidBookingDataError);
    expect(() => create({ customerEmail: "ana-exemplo.com" })).toThrow(InvalidBookingDataError);
  });

  it("recusa total fracionado ou negativo", () => {
    expect(() => create({ totalInCents: 100.5 })).toThrow(InvalidBookingDataError);
    expect(() => create({ totalInCents: -1 })).toThrow(InvalidBookingDataError);
  });
});

describe("Booking.restore", () => {
  const props = {
    id: "33333333-3333-4333-8333-333333333333",
    companyId: COMPANY_ID,
    roomId: ROOM_ID,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    customerPhone: null,
    startsAt: NINE,
    endsAt: TEN,
    status: BookingStatus.CONFIRMED,
    totalInCents: 12_000,
    notes: null,
    createdAt: NINE,
    updatedAt: NINE,
  };

  it("mantém a invariante de período", () => {
    expect(() => Booking.restore({ ...props, endsAt: NINE })).toThrow(InvalidBookingDataError);
  });

  /**
   * A grade da sala pode mudar depois que a reserva foi feita. Revalidar o
   * alinhamento na reidratação tornaria impossível listar ou cancelar reservas
   * legítimas no dia em que o admin trocasse `slot_minutes`.
   */
  it("não revalida o alinhamento com a grade, que é invariante só da criação", () => {
    const halfHour = Booking.restore({
      ...props,
      endsAt: new Date("2026-09-01T12:30:00.000Z"),
    });

    expect(halfHour.durationInMinutes).toBe(30);
  });
});

describe("Booking.cancel", () => {
  it("muda o status e atualiza o carimbo", () => {
    const booking = create();
    const before = booking.updatedAt;

    booking.cancel();

    expect(booking.status).toBe(BookingStatus.CANCELLED);
    expect(booking.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("é idempotente: cancelar de novo não muda nada", () => {
    const booking = create();

    booking.cancel();
    const afterFirst = booking.updatedAt;
    booking.cancel();

    expect(booking.status).toBe(BookingStatus.CANCELLED);
    expect(booking.updatedAt).toEqual(afterFirst);
  });
});
