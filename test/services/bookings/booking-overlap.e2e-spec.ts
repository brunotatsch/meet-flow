import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { companies } from "@services/companies/infra/database/schema/companies";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import { captureSqlFailure, createTestDatabase, type TestDatabase } from "../setup/test-database";

/** 2026-09-01 é uma terça-feira; os horários são fixos para o teste ser determinístico. */
const NOON = new Date("2026-09-01T12:00:00.000Z");
const ONE_PM = new Date("2026-09-01T13:00:00.000Z");
const HALF_PAST_TWELVE = new Date("2026-09-01T12:30:00.000Z");
const HALF_PAST_ONE = new Date("2026-09-01T13:30:00.000Z");
const TWO_PM = new Date("2026-09-01T14:00:00.000Z");

let database: TestDatabase;
let companyId: string;
let otherCompanyId: string;
let roomId: string;
let siblingRoomId: string;
let foreignRoomId: string;

function bookingAt(
  startsAt: Date,
  endsAt: Date,
  overrides: Partial<typeof bookings.$inferInsert> = {},
) {
  return {
    companyId,
    roomId,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    startsAt,
    endsAt,
    totalInCents: 15_000,
    ...overrides,
  } satisfies typeof bookings.$inferInsert;
}

beforeAll(async () => {
  database = createTestDatabase();

  const [company, otherCompany] = await database.db
    .insert(companies)
    .values([
      { organizationId: "org_overlap", name: "Hotel Aurora", slug: "hotel-aurora", type: "hotel" },
      {
        organizationId: "org_foreign",
        name: "Coworking Sul",
        slug: "coworking-sul",
        type: "coworking",
      },
    ])
    .returning();

  companyId = company!.id;
  otherCompanyId = otherCompany!.id;

  const [room, siblingRoom, foreignRoom] = await database.db
    .insert(rooms)
    .values([
      { companyId, name: "Sala Atlântico", capacity: 10, hourlyRateInCents: 15_000 },
      { companyId, name: "Sala Pacífico", capacity: 6, hourlyRateInCents: 12_000 },
      { companyId: otherCompanyId, name: "Sala Andes", capacity: 8, hourlyRateInCents: 9_000 },
    ])
    .returning();

  roomId = room!.id;
  siblingRoomId = siblingRoom!.id;
  foreignRoomId = foreignRoom!.id;
});

beforeEach(async () => {
  await database.client.unsafe("DELETE FROM bookings");
});

afterAll(async () => {
  await database?.close();
});

describe("constraint bookings_no_overlap", () => {
  it("rejeita duas reservas sobrepostas na mesma sala com SQLSTATE 23P01", async () => {
    await database.db.insert(bookings).values(bookingAt(NOON, ONE_PM));

    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(HALF_PAST_TWELVE, HALF_PAST_ONE)),
    );

    expect(failure).toEqual({ sqlState: "23P01", constraint: "bookings_no_overlap" });
  });

  it("aceita a mesma sobreposição quando a reserva anterior está cancelled", async () => {
    await database.db.insert(bookings).values(bookingAt(NOON, ONE_PM, { status: "cancelled" }));

    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(HALF_PAST_TWELVE, HALF_PAST_ONE)),
    );

    expect(failure).toBeNull();
  });

  it("aceita horários sobrepostos em salas diferentes", async () => {
    await database.db.insert(bookings).values(bookingAt(NOON, ONE_PM));

    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(NOON, ONE_PM, { roomId: siblingRoomId })),
    );

    expect(failure).toBeNull();
  });

  it("aceita reservas encostadas, provando o range semiaberto [)", async () => {
    await database.db.insert(bookings).values(bookingAt(NOON, ONE_PM));

    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(ONE_PM, TWO_PM)),
    );

    expect(failure).toBeNull();
  });

  it("volta a bloquear o horário quando uma reserva cancelled é reativada", async () => {
    const [cancelled] = await database.db
      .insert(bookings)
      .values(bookingAt(NOON, ONE_PM, { status: "cancelled" }))
      .returning();
    await database.db.insert(bookings).values(bookingAt(HALF_PAST_TWELVE, HALF_PAST_ONE));

    const failure = await captureSqlFailure(() =>
      database.db
        .update(bookings)
        .set({ status: "confirmed" })
        .where(eq(bookings.id, cancelled!.id)),
    );

    expect(failure).toEqual({ sqlState: "23P01", constraint: "bookings_no_overlap" });
  });
});

describe("integridade temporal e de tenant em bookings", () => {
  it("rejeita ends_at igual a starts_at pela check bookings_period_valid", async () => {
    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(NOON, NOON)),
    );

    expect(failure).toEqual({ sqlState: "23514", constraint: "bookings_period_valid" });
  });

  /**
   * O Postgres calcula a coluna gerada antes de avaliar as check constraints, e
   * `tstzrange` já recusa um limite inferior maior que o superior. Ou seja, o
   * intervalo invertido morre em `22000` e nunca chega em `bookings_period_valid`.
   * A MVP-07 precisa tratar os dois códigos como entrada inválida (400), não 409.
   */
  it("rejeita ends_at menor que starts_at já no cálculo de period", async () => {
    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(ONE_PM, NOON)),
    );

    expect(failure?.sqlState).toBe("22000");
  });

  it("rejeita reserva cuja empresa não é a dona da sala", async () => {
    const failure = await captureSqlFailure(() =>
      database.db.insert(bookings).values(bookingAt(NOON, ONE_PM, { roomId: foreignRoomId })),
    );

    expect(failure).toEqual({
      sqlState: "23503",
      constraint: "bookings_room_id_company_id_fk",
    });
  });
});
