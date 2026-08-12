import { z } from "zod";
import { companyTypeValues } from "@shared/enums/company-type";
import { NormalizedEmail } from "@shared/schemas/email";

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const SignUpSchema = z.object({
  user: z.object({
    name: z.string().trim().min(2).max(100),
    email: NormalizedEmail,
    password: z.string().min(8).max(72),
  }),
  company: z.object({
    name: z.string().trim().min(3).max(100),
    /**
     * Normaliza antes de validar: espaços nas pontas e maiúsculas são corrigidos,
     * mas o formato continua sendo exigido. `Hotel Central` segue inválido, porque
     * o espaço no meio não é algo que dê para adivinhar como hífen ou remoção.
     */
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(60)
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        "slug deve conter apenas letras minúsculas, números e hífens",
      ),
    type: z.enum(companyTypeValues),
    timezone: z.string().refine(isValidTimezone, "timezone deve ser um fuso IANA válido"),
  }),
});

export type SignUpInput = z.infer<typeof SignUpSchema>;

export const CompanyPublicSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  type: z.enum(companyTypeValues),
  timezone: z.string(),
});

export type CompanyPublic = z.infer<typeof CompanyPublicSchema>;

/**
 * Perfil da empresa exposto pelo wizard público (`GET /api/v1/public/:companySlug`).
 *
 * Sem `id` nem `slug`: quem consome já tem o slug na própria URL, e o `id` interno
 * não tem uso no fluxo público - toda rota sob `/public/:companySlug` resolve o
 * tenant de novo a partir do slug, nunca de um id devolvido por outra resposta.
 */
export const PublicCompanyResponseSchema = z.object({
  name: z.string(),
  type: z.enum(companyTypeValues),
  timezone: z.string(),
});

export type PublicCompanyResponse = z.infer<typeof PublicCompanyResponseSchema>;
