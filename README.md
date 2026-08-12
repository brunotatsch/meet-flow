# meet-flow

SaaS de agendamento de salas para hotéis e coworkings.
O roteiro completo está em [`docs/plano.md`](docs/plano.md) e as decisões já implementadas em [`docs/architecture.md`](docs/architecture.md).

## Requisitos

- [Bun](https://bun.sh) >= 1.3
- [Docker](https://www.docker.com/) com Docker Compose

## Rodando localmente

```bash
bun run dev
```

Esse comando faz tudo: instala dependências, garante o `.env`, sobe o Postgres via Docker, espera o banco ficar pronto, roda as migrations e inicia a API com hot reload em `http://localhost:3000`.

Verifique se subiu com:

```bash
curl http://localhost:3000/health
```

## Outros comandos

```bash
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun run test         # testes unitários (Vitest)
bun run test:e2e     # testes end-to-end contra o Postgres (usa .env.test)
bun run db:generate  # gera uma migration a partir dos schemas Drizzle
bun run db:migrate   # aplica as migrations pendentes
bun run db:studio    # abre o Drizzle Studio
```

`bun run test:e2e` é destrutivo: ele derruba o schema do banco apontado por `.env.test` e reaplica todas as migrations antes de rodar.
Existe uma trava que aborta a execução se o banco não terminar com `_test`.

`bun run db:studio` depende de um driver Node (`pg` ou `postgres`), que o projeto não instala.
O restante do fluxo de banco usa o driver nativo do Bun.

## Banco de dados

O schema vive junto de cada serviço, em `src/services/<serviço>/infra/database/schema/`, e o `drizzle.config.ts` os varre por glob.
As migrations versionadas ficam em `drizzle/`, incluindo `drizzle/meta/`, que o migrator precisa para saber o que já foi aplicado.

A prevenção de double-booking é uma invariante do banco, não da aplicação.
A tabela `bookings` tem uma coluna gerada `period` (`tstzrange(starts_at, ends_at, '[)')`) e uma constraint `EXCLUDE USING gist` que impede dois períodos sobrepostos na mesma sala, ignorando reservas canceladas.
Como o intervalo é semiaberto, uma reserva que começa exatamente quando a anterior termina é aceita.
A aplicação nunca escreve `period`: a coluna nem existe no schema TypeScript.

Conflito de horário chega na aplicação como o SQLSTATE `23P01`, que a MVP-07 traduz para HTTP 409.

As tabelas de autenticação (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) são geradas pelo CLI do Better Auth:

```bash
bunx @better-auth/cli generate \
  --config better-auth-cli.config.ts \
  --output src/services/identity/infra/database/schema/auth.ts
```

A config da raiz existe porque o CLI roda sob Node e não carrega o driver `bun-sql`.
Ela importa a mesma lista de plugins que a aplicação usa, então o schema gerado não diverge do runtime.
A saída do CLI precisa de uma edição manual, descrita no cabeçalho do arquivo gerado.

## Autenticação e multi-tenancy

O tenant é a `organization` do Better Auth; `companies` guarda o perfil de negócio e aponta para ela.

```text
POST /api/v1/sign-up   # cria usuário, organização, vínculo owner e company em uma transação
GET  /api/v1/me        # usuário, company e papel da sessão atual
POST /api/auth/*       # login, logout e sessão, servidos pelo Better Auth
```

O cadastro embutido do Better Auth e a criação avulsa de organização estão desligados: o cadastro tem um caminho só.

A regra que atravessa todo o backend: **`companyId` vem sempre de `request.auth`, nunca do body, da query ou de um header.**
O porquê e como aplicá-la estão em [`docs/architecture.md`](docs/architecture.md).

## Salas e disponibilidade

```text
GET    /api/v1/rooms                        # CRUD de salas, tudo atrás de requireAuth
GET    /api/v1/rooms/:id/schedules          # janela de funcionamento por dia da semana
PUT    /api/v1/rooms/:id/schedules          # substitui a semana inteira, em uma transação
DELETE /api/v1/rooms/:id/schedules/:weekday # fecha um dia específico

GET /api/v1/public/:companySlug/rooms/:roomId/availability?date=YYYY-MM-DD
```

A rota de disponibilidade é pública: é o passo 2 do wizard, consumido por quem ainda não tem conta.
Ela devolve a grade do dia no fuso da empresa, em ISO 8601 com offset explícito, com o preço de cada slot proporcional à tarifa horária da sala.

Sala sem agenda cadastrada para aquele dia é tratada como fechada, nunca como aberta 24h.
Sala inativa ou de outra empresa responde 404.

A grade avança em tempo real, não em horário de parede, para que os dias de transição de horário de verão não dupliquem nem percam slots.
O raciocínio completo, o arredondamento de preço e o tratamento das horas inexistente e ambígua estão em [`docs/architecture.md`](docs/architecture.md).

## Estrutura

```text
src/
  shared/     # Contratos Zod, enums e tipos compartilhados entre backend e frontend
  services/   # Módulos de backend (domain / application / infra por serviço)
  web/        # SPA React (adicionado a partir da etapa de frontend)
```
