import { z } from "zod";
import { AppRole } from "@shared/auth/permissions";
import { CompanyPublicSchema } from "@shared/schemas/company.schema";
import { NormalizedEmail } from "@shared/schemas/email";

export const SignInSchema = z.object({
  email: NormalizedEmail,
  password: z.string().min(1).max(72),
});

export type SignInInput = z.infer<typeof SignInSchema>;

export const AuthenticatedUserSchema = z.object({
  /** Id textual gerado pelo Better Auth, não uuid. */
  id: z.string(),
  name: z.string(),
  email: z.email(),
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

/**
 * Resposta de `GET /api/v1/me` e de `POST /api/v1/sign-up`.
 *
 * O papel é um conjunto fechado compartilhado com a matriz de autorização.
 */
export const SessionSchema = z.object({
  user: AuthenticatedUserSchema,
  company: CompanyPublicSchema,
  role: z.enum([AppRole.OWNER, AppRole.MANAGER, AppRole.STAFF]),
});

export type Session = z.infer<typeof SessionSchema>;
