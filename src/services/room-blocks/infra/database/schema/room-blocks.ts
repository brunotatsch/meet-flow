import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "@services/companies/infra/database/schema/companies";
import { rooms } from "@services/rooms/infra/database/schema/rooms";

/** `period` e a exclusão GiST são SQL manual na migration 0009. */
export const roomBlocks = pgTable(
  "room_blocks",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    roomId: uuid().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    reason: text().notNull(),
    createdBy: text().notNull(),
    /** Liga ocorrências materializadas da mesma criação recorrente. */
    recurrenceGroupId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "room_blocks_room_id_company_id_fk",
      columns: [table.roomId, table.companyId],
      foreignColumns: [rooms.id, rooms.companyId],
    }).onDelete("cascade"),
    index("room_blocks_company_starts_at_idx").on(table.companyId, table.startsAt),
    index("room_blocks_room_starts_at_idx").on(table.roomId, table.startsAt),
    index("room_blocks_recurrence_group_idx").on(table.recurrenceGroupId),
    check("room_blocks_period_valid", sql`${table.endsAt} > ${table.startsAt}`),
    check("room_blocks_reason_valid", sql`length(btrim(${table.reason})) BETWEEN 1 AND 500`),
  ],
);
