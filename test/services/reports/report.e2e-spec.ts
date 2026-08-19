import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ReportResponseSchema } from "@shared/schemas/report.schema";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { companies } from "@services/companies/infra/database/schema/companies";
import { organization } from "@services/identity/infra/database/schema/auth";
import { DrizzleReportRepository } from "@services/reports/infra/database/drizzle-report.repository";
import { roomSchedules } from "@services/rooms/infra/database/schema/room-schedules";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import { createTestDatabase, insertOrganization, type TestDatabase } from "../setup/test-database";

const COMPANY_ID = randomUUID();
const OTHER_COMPANY_ID = randomUUID();
const ROOM_ID = randomUUID();
const OTHER_ROOM_ID = randomUUID();
const ORGANIZATION_ID = `org-report-${randomUUID()}`;
const OTHER_ORGANIZATION_ID = `org-report-other-${randomUUID()}`;
const REPORT_FROM = new Date("2030-06-04T03:00:00.000Z");
const REPORT_TO = new Date("2030-06-05T03:00:00.000Z");
const CONFIRMED_AT = new Date("2030-05-01T12:00:00.000Z");

let database: TestDatabase;

beforeAll(async () => {
  database = createTestDatabase();
  await insertOrganization(database, ORGANIZATION_ID);
  await insertOrganization(database, OTHER_ORGANIZATION_ID);
  await database.db.insert(companies).values([
    {
      id: COMPANY_ID,
      organizationId: ORGANIZATION_ID,
      name: "Hotel Relatório",
      slug: `hotel-report-${COMPANY_ID}`,
      type: "hotel",
      timezone: "America/Sao_Paulo",
    },
    {
      id: OTHER_COMPANY_ID,
      organizationId: OTHER_ORGANIZATION_ID,
      name: "Tenant invisível",
      slug: `hotel-report-other-${OTHER_COMPANY_ID}`,
      type: "hotel",
      timezone: "America/Sao_Paulo",
    },
  ]);
  await database.db.insert(rooms).values([
    {
      id: ROOM_ID,
      companyId: COMPANY_ID,
      name: "Sala Principal",
      capacity: 12,
      hourlyRateInCents: 10_000,
    },
    {
      id: OTHER_ROOM_ID,
      companyId: OTHER_COMPANY_ID,
      name: "Sala do outro tenant",
      capacity: 12,
      hourlyRateInCents: 999_999,
    },
  ]);
  await database.db.insert(roomSchedules).values([
    {
      roomId: ROOM_ID,
      weekday: 2,
      opensAt: "09:00:00",
      closesAt: "13:00:00",
      slotMinutes: 60,
    },
    {
      roomId: OTHER_ROOM_ID,
      weekday: 2,
      opensAt: "00:00:00",
      closesAt: "23:59:00",
      slotMinutes: 60,
    },
  ]);

  const row = (overrides: Partial<typeof bookings.$inferInsert>): typeof bookings.$inferInsert => ({
    companyId: COMPANY_ID,
    roomId: ROOM_ID,
    customerName: "Cliente Relatório",
    customerEmail: "relatorio@exemplo.com",
    startsAt: new Date("2030-06-04T12:00:00.000Z"),
    endsAt: new Date("2030-06-04T13:00:00.000Z"),
    status: "confirmed",
    totalInCents: 10_000,
    confirmedAt: CONFIRMED_AT,
    ...overrides,
  });

  await database.db.insert(bookings).values([
    row({ stripePaymentIntentId: `pi-${randomUUID()}` }),
    row({
      startsAt: new Date("2030-06-04T13:00:00.000Z"),
      endsAt: new Date("2030-06-04T14:00:00.000Z"),
      totalInCents: 20_000,
    }),
    row({
      startsAt: new Date("2030-06-04T14:00:00.000Z"),
      endsAt: new Date("2030-06-04T15:00:00.000Z"),
      status: "no_show",
      totalInCents: 8_000,
      stripePaymentIntentId: `pi-${randomUUID()}`,
    }),
    row({
      startsAt: new Date("2030-06-04T15:00:00.000Z"),
      endsAt: new Date("2030-06-04T16:00:00.000Z"),
      status: "cancelled",
      totalInCents: 5_000,
      stripePaymentIntentId: `pi-${randomUUID()}`,
      cancellationReason: "customer",
    }),
    row({ status: "cancelled", totalInCents: 20_000, cancellationReason: "cancelled" }),
    row({
      status: "cancelled",
      confirmedAt: null,
      totalInCents: 10_000,
      cancellationReason: "expired",
    }),
    row({
      companyId: OTHER_COMPANY_ID,
      roomId: OTHER_ROOM_ID,
      totalInCents: 999_999,
      stripePaymentIntentId: `pi-${randomUUID()}`,
    }),
  ]);

  // Volume realista no próprio tenant: tentativas de Checkout expiradas não
  // podem inflar reservas/cancelamentos, mas precisam ser filtradas rapidamente.
  await database.client.unsafe(
    `INSERT INTO bookings (
       company_id, room_id, customer_name, customer_email, starts_at, ends_at,
       status, total_in_cents, cancellation_reason
     )
     SELECT $1::uuid, $2::uuid, 'Checkout expirado',
       'expired-' || generated || '@example.test',
       '2030-06-04 12:00:00+00'::timestamptz,
       '2030-06-04 13:00:00+00'::timestamptz,
       'cancelled'::booking_status, 10000, 'expired'
     FROM generate_series(1, 3000) generated`,
    [COMPANY_ID, ROOM_ID],
  );
});

afterAll(async () => {
  if (!database) return;
  await database.db
    .delete(bookings)
    .where(inArray(bookings.companyId, [COMPANY_ID, OTHER_COMPANY_ID]));
  await database.db.delete(rooms).where(inArray(rooms.companyId, [COMPANY_ID, OTHER_COMPANY_ID]));
  await database.db.delete(companies).where(inArray(companies.id, [COMPANY_ID, OTHER_COMPANY_ID]));
  await database.db
    .delete(organization)
    .where(inArray(organization.id, [ORGANIZATION_ID, OTHER_ORGANIZATION_ID]));
  await database.close();
});

describe("DrizzleReportRepository", () => {
  it("confere a contagem manual, receita paga, ocupação e isolamento de tenant", async () => {
    const startedAt = performance.now();
    const result = await new DrizzleReportRepository().aggregate({
      companyId: COMPANY_ID,
      timezone: "America/Sao_Paulo",
      fromDate: "2030-06-04",
      toDate: "2030-06-04",
      from: REPORT_FROM,
      toExclusive: REPORT_TO,
    });
    const elapsed = performance.now() - startedAt;

    expect(() =>
      ReportResponseSchema.omit({ period: true, timezone: true }).parse(result),
    ).not.toThrow();
    expect(result.summary).toEqual({
      totalBookings: 5,
      paidBookings: 3,
      cancelledBookings: 2,
      occupancyRate: 50,
      cancellationRate: 40,
      revenueInCents: 23_000,
      averageTicketInCents: 7_667,
      peakHour: 9,
    });
    expect(result.occupancyByRoom).toEqual([
      {
        roomId: ROOM_ID,
        roomName: "Sala Principal",
        bookedMinutes: 120,
        availableMinutes: 240,
        occupancyRate: 50,
      },
    ]);
    expect(result.occupancyByDay).toEqual([
      {
        date: "2030-06-04",
        bookedMinutes: 120,
        availableMinutes: 240,
        occupancyRate: 50,
      },
    ]);
    expect(result.revenueByRoom).toEqual([
      {
        roomId: ROOM_ID,
        roomName: "Sala Principal",
        bookings: 3,
        revenueInCents: 23_000,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("outro tenant");
    expect(elapsed).toBeLessThan(5_000);
  });
});
