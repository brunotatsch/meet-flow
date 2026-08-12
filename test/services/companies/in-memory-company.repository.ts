import type { Company } from "@services/companies/domain/company";
import { CompanyRepository } from "@services/companies/domain/company.repository";

export class InMemoryCompanyRepository extends CompanyRepository {
  private readonly companies = new Map<string, Company>();

  add(company: Company): Company {
    this.companies.set(company.id, company);

    return company;
  }

  async findById(id: string): Promise<Company | null> {
    return this.companies.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Company | null> {
    return [...this.companies.values()].find((company) => company.slug === slug) ?? null;
  }
}
