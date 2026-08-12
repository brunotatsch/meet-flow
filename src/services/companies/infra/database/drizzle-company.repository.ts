import { eq } from "drizzle-orm";
import type { Company } from "@services/companies/domain/company";
import { CompanyRepository } from "@services/companies/domain/company.repository";
import { db } from "@services/database/client";
import { companies } from "./schema/companies";

const companyColumns = {
  id: companies.id,
  name: companies.name,
  slug: companies.slug,
  type: companies.type,
  timezone: companies.timezone,
};

export class DrizzleCompanyRepository extends CompanyRepository {
  async findById(id: string): Promise<Company | null> {
    const [row] = await db
      .select(companyColumns)
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    return row ?? null;
  }

  async findBySlug(slug: string): Promise<Company | null> {
    const [row] = await db
      .select(companyColumns)
      .from(companies)
      .where(eq(companies.slug, slug))
      .limit(1);

    return row ?? null;
  }
}
