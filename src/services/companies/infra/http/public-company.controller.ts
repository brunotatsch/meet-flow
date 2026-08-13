import type { FastifyReply, FastifyRequest } from "fastify";
import type { PublicCompanyResponse } from "@shared/schemas/company.schema";
import type { CompanyType } from "@shared/enums/company-type";
import type { Company } from "../../domain/company";
import { getPublicCompany } from "./resolve-company-slug";

/**
 * Passo 1 do wizard: perfil público da empresa, resolvido pelo `preHandler`
 * compartilhado do plugin `/public/:companySlug`.
 */
export class PublicCompanyController {
  async show(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const company = getPublicCompany(request);

    return reply.send(toPublicCompanyResponse(company));
  }
}

/**
 * `Company.type` é `string` no domínio (leitura simples, sem regra de negócio a
 * proteger), mas o contrato público fecha no enum de `CompanyType` - o valor só
 * chega até aqui depois de validado pelo `SignUpSchema` no cadastro, então o
 * estreitamento é seguro.
 */
function toPublicCompanyResponse(company: Company): PublicCompanyResponse {
  return {
    name: company.name,
    type: company.type as CompanyType,
    timezone: company.timezone,
  };
}
