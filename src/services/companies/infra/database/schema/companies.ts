import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organization } from "@services/identity/infra/database/schema/auth";

export const companyType = pgEnum("company_type", ["hotel", "coworking"]);

export const companies = pgTable(
  "companies",
  {
    id: uuid().primaryKey().defaultRandom(),
    /**
     * Organização do Better Auth que representa o tenant, um-para-um com esta linha
     * (garantido pelo unique abaixo). O tipo é `text` porque o Better Auth gera ids
     * textuais, não uuid.
     *
     * `onDelete: "cascade"`: apagar a organização apaga o perfil de negócio junto.
     * As reservas seguram esse apagamento, porque `bookings.company_id` é
     * `onDelete: "restrict"`; excluir um tenant com histórico é uma operação
     * deliberada, não um efeito colateral.
     */
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
