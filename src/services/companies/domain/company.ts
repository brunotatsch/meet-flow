/**
 * Perfil de negócio do tenant, em leitura.
 *
 * É um tipo, não uma entidade com métodos: até aqui a `company` só nasce dentro da
 * transação de cadastro (`identity/infra/auth/sign-up.ts`) e é lida por quem precisa
 * do `timezone` ou do `slug`. Não há regra de negócio para proteger, e inventar uma
 * entidade rica sem comportamento só adicionaria cerimônia.
 */
export interface Company {
  id: string;
  name: string;
  slug: string;
  type: string;
  /** Fuso IANA em que a agenda das salas é interpretada. */
  timezone: string;
}
