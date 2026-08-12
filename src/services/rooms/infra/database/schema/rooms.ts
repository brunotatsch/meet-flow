import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "@services/companies/infra/database/schema/companies";

export const rooms = pgTable(
  "rooms",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    capacity: integer().notNull(),
    hourlyRateInCents: integer().notNull(),
    amenities: jsonb().$type<string[]>().notNull().default([]),
    photoUrl: text(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("rooms_company_id_name_unique").on(table.companyId, table.name),
    /**
     * Alvo da FK composta de `bookings`: garante, no banco, que uma reserva
     * não possa apontar para uma sala de outra empresa.
     */
    unique("rooms_id_company_id_unique").on(table.id, table.companyId),
    index("rooms_company_id_idx").on(table.companyId),
    check("rooms_capacity_positive", sql`${table.capacity} > 0`),
    check("rooms_hourly_rate_non_negative", sql`${table.hourlyRateInCents} >= 0`),
  ],
);
