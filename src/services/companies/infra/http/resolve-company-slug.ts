import type { FastifyRequest } from "fastify";
import type { Company } from "@services/companies/domain/company";
import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { HttpError } from "@services/http/http-error";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Preenchido pelo `preHandler` criado por `createResolveCompanySlug`. Fica
     * opcional de propósito, como `request.auth`: em qualquer rota fora do escopo
     * `/public/:companySlug` ele é `undefined`. Use `getPublicCompany` para lê-lo já
     * estreitado.
     */
    publicCompany?: Company;
  }
}

/**
 * Lê `request.publicCompany` garantindo que o `preHandler` rodou.
 *
 * Se disparar, é bug de composição de rota (handler público registrado fora do
 * plugin `/public/:companySlug`), não erro do cliente.
 */
export function getPublicCompany(request: FastifyRequest): Company {
  if (!request.publicCompany) {
    throw new Error(
      "Rota lê request.publicCompany mas não declara o preHandler resolveCompanySlug.",
    );
  }

  return request.publicCompany;
}

interface ResolveCompanySlugRequest {
  Params: { companySlug: string };
}

/**
 * Único ponto de resolução slug -> `companyId` do fluxo público.
 *
 * É a implementação da regra documentada em `docs/architecture.md`: o slug da URL é
 * a exceção à obrigação de todo `companyId` vir de `request.auth`, e essa exceção
 * vale só dentro do plugin `/public/:companySlug`, que registra este `preHandler`
 * uma única vez para todas as suas rotas. Nenhum controller sob esse plugin repete
 * a consulta por conta própria.
 *
 * Interrompe com 404 **lançando** `HttpError`, pelo mesmo motivo de `requireAuth`:
 * no Bun, responder de dentro de um hook async não impede o handler de rodar. Ver
 * `@services/http/http-error`.
 */
export function createResolveCompanySlug(
  companyRepository: CompanyRepository,
): (request: FastifyRequest<ResolveCompanySlugRequest>) => Promise<void> {
  return async function resolveCompanySlug(
    request: FastifyRequest<ResolveCompanySlugRequest>,
  ): Promise<void> {
    const company = await companyRepository.findBySlug(request.params.companySlug);

    if (!company) {
      throw new HttpError(404, "COMPANY_NOT_FOUND", "Empresa não encontrada.");
    }

    request.publicCompany = company;
  };
}
