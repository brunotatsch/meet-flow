import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "@services/companies/infra/database/schema/companies";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Snapshot textual: continua identificando o ator mesmo se a conta for apagada. */
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: uuid("resource_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_company_created_at_idx").on(table.companyId, table.createdAt),
    index("audit_events_resource_idx").on(table.resource, table.resourceId),
    index("audit_events_actor_user_id_idx").on(table.actorUserId),
  ],
);
