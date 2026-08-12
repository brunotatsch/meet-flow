import { eq, getTableColumns } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@services/database/migrator";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { companies } from "@services/companies/infra/database/schema/companies";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import {
  captureSqlFailure,
  createTestDatabase,
  insertOrganization,
  type TestDatabase,
} from "../setup/test-database";

let database: TestDatabase;

beforeAll(() => {
  database = createTestDatabase();
});

afterAll(async () => {
  await database?.close();
});

/**
 * O `globalSetup` já aplicou as migrations neste banco a partir de um schema
 * vazio, então cada teste aqui verifica o resultado desse processo.
 */
describe("migrations", () => {
  it("é idempotente: reaplicar sobre um banco já migrado não faz nada", async () => {
    const failure = await captureSqlFailure(() => runMigrations(process.env.DATABASE_URL!));

    expect(failure).toBeNull();
  });

  it("instala a extensão btree_gist exigida pela constraint de exclusão", async () => {
    const rows = await database.client.unsafe(
      "SELECT extname FROM pg_extension WHERE extname = 'btree_gist'",
    );

    expect(rows).toHaveLength(1);
  });

  it("cria bookings_no_overlap como EXCLUDE, ignorando reservas canceladas", async () => {
    const [constraint] = await database.client.unsafe(
      `SELECT contype, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conname = 'bookings_no_overlap'`,
    );

    expect(constraint?.contype).toBe("x");
    expect(constraint?.definition).toContain("EXCLUDE USING gist");
    expect(constraint?.definition).toContain("room_id WITH =");
    expect(constraint?.definition).toContain("period WITH &&");
    expect(constraint?.definition).toContain("status <> 'cancelled'::booking_status");
  });
});

describe("coluna gerada bookings.period", () => {
  it("é mantida pelo Postgres como STORED", async () => {
    const [column] = await database.client.unsafe(
      `SELECT a.attgenerated, pg_get_expr(d.adbin, d.adrelid) AS expression
         FROM pg_attribute a
         JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'bookings'::regclass AND a.attname = 'period'`,
    );

    expect(column?.attgenerated).toBe("s");
    expect(column?.expression).toContain("tstzrange(starts_at, ends_at, '[)'");
  });

  it("não existe no schema Drizzle, então a aplicação não tem como escrevê-la", () => {
    expect(Object.keys(getTableColumns(bookings))).not.toContain("period");
  });

  it("é recusada pelo Postgres mesmo em uma escrita direta, fora do ORM", async () => {
    const failure = await captureSqlFailure(() =>
      database.client.unsafe(
        `UPDATE bookings SET period = tstzrange(now(), now() + interval '1 hour', '[)')`,
      ),
    );

    expect(failure?.sqlState).toBe("428C9");
  });

  it("acompanha starts_at e ends_at sem a aplicação tocar em period", async () => {
    await insertOrganization(database, "org_period");
    const [company] = await database.db
      .insert(companies)
      .values({
        organizationId: "org_period",
        name: "Hotel Meridiano",
        slug: "hotel-meridiano",
        type: "hotel",
      })
      .returning();
    const [room] = await database.db
      .insert(rooms)
      .values({
        companyId: company!.id,
        name: "Sala Meridiano",
        capacity: 4,
        hourlyRateInCents: 10_000,
      })
      .returning();
    const [booking] = await database.db
      .insert(bookings)
      .values({
        companyId: company!.id,
        roomId: room!.id,
        customerName: "Caio Lima",
        customerEmail: "caio@exemplo.com",
        startsAt: new Date("2026-10-05T12:00:00.000Z"),
        endsAt: new Date("2026-10-05T13:00:00.000Z"),
        totalInCents: 10_000,
      })
      .returning();

    const readPeriod = async (): Promise<string> => {
      const [row] = await database.client.unsafe(
        "SELECT period::text AS period FROM bookings WHERE id = $1",
        [booking!.id],
      );
      return row.period as string;
    };

    expect(await readPeriod()).toBe('["2026-10-05 12:00:00+00","2026-10-05 13:00:00+00")');

    await database.db
      .update(bookings)
      .set({ startsAt: new Date("2026-10-05T12:30:00.000Z") })
      .where(eq(bookings.id, booking!.id));

    expect(await readPeriod()).toBe('["2026-10-05 12:30:00+00","2026-10-05 13:00:00+00")');
  });
});
