import { loadDirectDatabaseUrl } from "@services/config/database-env";

/**
 * O seed é uma operação administrativa one-shot. Sobrescrever a URL antes dos
 * imports dinâmicos faz todo o grafo Drizzle/Better Auth usar a conexão direta,
 * sem criar um segundo caminho de cadastro.
 */
process.env.DATABASE_URL = loadDirectDatabaseUrl();

const [{ SignUpConflictError, signUp }, { SignUpSchema }] = await Promise.all([
  import("@services/identity/infra/auth/sign-up"),
  import("@shared/schemas/company.schema"),
]);

/**
 * Seed de desenvolvimento: cria uma empresa e um usuário `owner` prontos para logar
 * em `/admin/login`, usando o mesmo caminho transacional de `POST /api/v1/sign-up`
 * (ver `signUp` em `sign-up.ts`), para não duplicar a lógica de hash de senha nem
 * arriscar um usuário órfão sem organização.
 *
 * Idempotente: rodar de novo com o banco já semeado apenas avisa e sai, em vez de
 * falhar - importante porque `bun run db:seed` deve poder rodar toda vez que o
 * ambiente de dev sobe.
 */
const SEED_INPUT = SignUpSchema.parse({
  user: {
    name: "Admin Dev",
    email: "hotel-dev@dev.com",
    password: "dev12345",
  },
  company: {
    name: "Hotel Dev",
    slug: "hotel-dev",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  },
});

try {
  const { session } = await signUp(SEED_INPUT);

  console.log(
    `Seed criado: empresa "${session.company.name}" (slug "${session.company.slug}"), usuário "${session.user.email}".`,
  );
} catch (error) {
  if (error instanceof SignUpConflictError && error.code === "EMAIL_ALREADY_REGISTERED") {
    console.log(`Seed já existe: usuário "${SEED_INPUT.user.email}" já cadastrado, nada a fazer.`);
  } else {
    throw error;
  }
}

console.log(
  `Login em /admin/login -> e-mail: ${SEED_INPUT.user.email} | senha: ${SEED_INPUT.user.password}`,
);
