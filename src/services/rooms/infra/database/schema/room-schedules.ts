import { sql } from "drizzle-orm";
import { check, integer, pgTable, smallint, time, unique, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms";

/**
 * Janela de funcionamento da sala por dia da semana (0 = domingo ... 6 = sábado),
 * consumida pelo motor de disponibilidade da MVP-06.
 * Sala sem linha aqui é tratada como indisponível, nunca como aberta 24h.
 */
export const roomSchedules = pgTable(
  "room_schedules",
  {
    id: uuid().primaryKey().defaultRandom(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    weekday: smallint().notNull(),
    opensAt: time().notNull(),
    closesAt: time().notNull(),
    slotMinutes: integer().notNull().default(60),
  },
  (table) => [
    unique("room_schedules_room_id_weekday_unique").on(table.roomId, table.weekday),
    check("room_schedules_weekday_range", sql`${table.weekday} between 0 and 6`),
    check("room_schedules_window_valid", sql`${table.closesAt} > ${table.opensAt}`),
    check("room_schedules_slot_minutes_positive", sql`${table.slotMinutes} > 0`),
  ],
);
