import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "@services/companies/infra/database/schema/companies";
import { rooms } from "@services/rooms/infra/database/schema/rooms";

export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
]);

/**
 * A prevenção de double-booking mora no banco, não na aplicação.
 *
 * A coluna gerada `period` (`tstzrange(starts_at, ends_at, '[)')`) e a constraint
 * `bookings_no_overlap` (`EXCLUDE USING gist ... WHERE (status <> 'cancelled')`)
 * são criadas por SQL manual na migration `0001_booking_no_overlap`, porque o
 * Drizzle não sabe expressá-las. `period` é deliberadamente ausente deste schema:
 * o banco a mantém e a aplicação nunca a escreve.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    roomId: uuid().notNull(),
    customerName: text().notNull(),
    customerEmail: text().notNull(),
    customerPhone: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    status: bookingStatus().notNull().default("pending"),
    totalInCents: integer().notNull(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    /**
     * FK composta em vez de `room_id -> rooms.id`: amarra a reserva à sala **e**
     * à empresa dona dela, tornando impossível gravar uma reserva cruzando tenants.
     */
    foreignKey({
      name: "bookings_room_id_company_id_fk",
      columns: [table.roomId, table.companyId],
      foreignColumns: [rooms.id, rooms.companyId],
    }).onDelete("restrict"),
    index("bookings_company_id_starts_at_idx").on(table.companyId, table.startsAt),
    index("bookings_room_id_starts_at_idx").on(table.roomId, table.startsAt),
    check("bookings_period_valid", sql`${table.endsAt} > ${table.startsAt}`),
    check("bookings_total_non_negative", sql`${table.totalInCents} >= 0`),
  ],
);
