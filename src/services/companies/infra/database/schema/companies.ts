import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const companyType = pgEnum("company_type", ["hotel", "coworking"]);

export const companies = pgTable(
  "companies",
  {
    id: uuid().primaryKey().defaultRandom(),
    /**
     * Organização do Better Auth que representa o tenant.
     * A FK só é criada na MVP-04, quando as tabelas de auth passam a existir;
     * o tipo é `text` porque o Better Auth gera ids textuais, não uuid.
     */
    organizationId: text().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    type: companyType().notNull(),
    /** Fuso IANA usado pelo motor de disponibilidade (MVP-06). */
    timezone: text().notNull().default("America/Sao_Paulo"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("companies_organization_id_unique").on(table.organizationId),
    unique("companies_slug_unique").on(table.slug),
    check("companies_slug_not_blank", sql`length(btrim(${table.slug})) > 0`),
  ],
);
