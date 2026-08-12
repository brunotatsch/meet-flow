import type { Company } from "./company";

export abstract class CompanyRepository {
  abstract findById(id: string): Promise<Company | null>;

  /**
   * Resolve o tenant a partir do slug público da URL.
   *
   * É o único ponto em que uma empresa é identificada por algo vindo do cliente, e
   * existe só para o fluxo público de reserva, que por definição não tem sessão. O
   * `companyId` resolvido aqui nunca substitui `request.auth` em rota autenticada.
   */
  abstract findBySlug(slug: string): Promise<Company | null>;
}
