import { z } from "zod";

/**
 * E-mail normalizado: sem espaços nas pontas e em minúsculas.
 *
 * A normalização é obrigatória, não cosmética. O Better Auth procura o usuário com
 * `email.toLowerCase()`, então guardar o e-mail como foi digitado deixaria quem se
 * cadastrou com maiúsculas sem conseguir entrar depois.
 *
 * O `pipe` existe porque a ordem importa: `z.email()` validaria o formato antes do
 * `trim`, e `" ana@exemplo.com "` seria recusado por causa dos espaços.
 */
export const NormalizedEmail = z.string().trim().toLowerCase().pipe(z.email());
