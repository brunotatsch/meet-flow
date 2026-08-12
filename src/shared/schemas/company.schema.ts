import { z } from "zod";
import { companyTypeValues } from "@shared/enums/company-type";

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
    name: z.string().min(2).max(100),
    email: z.email(),
    password: z.string().min(8).max(72),
  }),
  company: z.object({
    name: z.string().min(3).max(100),
    slug: z
      .string()
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
