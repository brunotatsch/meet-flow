# meet-flow

SaaS multi-tenant de agendamento de salas para hotéis e coworkings. A aplicação roda em
arquitetura Serverless: SPA React 19/Vite na CDN da Vercel, Fastify em uma Vercel Function com
runtime Bun e Supabase Postgres acessado pelo Transaction pooler.

As decisões e invariantes estão em [`docs/architecture.md`](docs/architecture.md); o estado das
entregas e a operação de produção estão em [`docs/plano.md`](docs/plano.md).

## O que está entregue

- wizard público com disponibilidade no fuso da empresa, hold de 31 minutos e Stripe Checkout;
- assinaturas `free`, `starter` e `pro`, limites por tenant e portal de cobrança;
- autenticação Better Auth, organizações multi-tenant e RBAC `owner`/`manager`/`staff`;
- gestão de equipe com convites, aceite/cadastro e proteção do último owner;
- agenda diária e semanal, reserva manual, reagendamento, check-in, check-out e no-show;
- bloqueios de sala avulsos ou recorrentes, refletidos na disponibilidade pública;
- relatórios de ocupação, receita e cancelamentos, com exportação CSV;
- e-mails transacionais por outbox durável e cancelamento por link assinado;
- hardening HTTP, logs estruturados, request ID, liveness/readiness e rate limit distribuído.

## Requisitos

- [Bun](https://bun.sh) >= 1.3;
- Docker Engine, Docker Desktop ou outro runtime compatível com o Supabase CLI, em execução;
- um projeto Supabase separado por ambiente para usar o modo remoto, Preview ou Production;
- conta Stripe em modo de teste para exercitar pagamentos;
- Resend ou `EMAIL_PROVIDER=disabled` para desenvolvimento.

Docker é dependência **somente do desenvolvimento local**, porque o Supabase CLI o usa para subir
sua stack. Não há Dockerfile, container da aplicação ou Docker no deploy de produção: Vercel e o
Supabase gerenciado continuam sendo a topologia publicada.

## Rodando localmente

```bash
cp .env.example .env
bun install
bun run dev
```

Sem configuração adicional, `bun run dev` usa `DEV_DATABASE_MODE=local`. O orquestrador:

1. valida Bun, Supabase CLI e um runtime Docker compatível;
2. inicia a stack local do Supabase somente se ela ainda não estiver em execução;
3. aplica as migrations versionadas do Drizzle;
4. executa o preflight de configuração, conexão e versão do schema;
5. inicia a API Fastify em modo watch e o frontend Vite.

Drizzle é o único sistema de migrations. Essa aplicação automática acontece no processo de
orquestração local, antes da API subir; migrations nunca rodam no import da aplicação, em request
ou cold start. `Ctrl+C` encerra API e Vite, mas deixa a stack Supabase ativa para a próxima sessão.
Use `bun run db:local:stop` quando quiser derrubá-la explicitamente.

O comando inicia a API local com hot reload em `http://localhost:3000` e o frontend Vite em
`http://localhost:5173`. O proxy do Vite encaminha `/api` para o Fastify local, mantendo a mesma
origem vista pela SPA.

Para trabalhar deliberadamente contra um projeto Supabase remoto, configure `DATABASE_URL` com o
Transaction pooler e `DIRECT_DATABASE_URL` com a conexão direta ou Session pooler e execute:

```bash
DEV_DATABASE_MODE=remote bun run dev
```

O modo remoto preserva exatamente as URLs fornecidas e **nunca aplica migrations
automaticamente**. Depois de confirmar projeto e ambiente, execute `bun run db:migrate` de forma
explícita antes de iniciar uma versão que dependa de schema novo. Nunca use credenciais de
Production no desenvolvimento cotidiano.

```bash
curl http://localhost:3000/api/health
curl http://localhost:5173/api/health
curl http://localhost:3000/api/ready
```

`/api/health` é liveness sem dependências; `/api/ready` consulta o banco e responde 503 sem expor
detalhes quando o Postgres não está disponível.

## Comandos

```bash
bun run dev             # Supabase local + migrations + preflight + API + Vite
bun run start:local     # somente Fastify local, com listen() e preflight
bun run build           # build de produção da SPA em dist/web
bun run lint            # ESLint em backend e frontend
bun run typecheck       # TypeScript estrito em backend e frontend
bun run test            # testes do backend
bun run test:web        # testes dos componentes React
bun run test:e2e        # integração destrutiva contra o banco de .env.test
bun run db:local:start  # inicia/reutiliza a stack local do Supabase
bun run db:local:status # mostra o estado e endpoints da stack local
bun run db:local:stop   # encerra explicitamente a stack local
bun run db:generate     # gera migration Drizzle durante desenvolvimento
bun run db:migrate      # aplica migrations com DIRECT_DATABASE_URL
bun run db:seed         # seed explícito de desenvolvimento
bun run db:studio       # Drizzle Studio
```

Os comandos `db:local:*` controlam somente a stack do Supabase CLI. Eles não iniciam nem encerram
API ou Vite. Em `DEV_DATABASE_MODE=remote`, `bun run dev` não chama esses comandos.

`bun run test:e2e` derruba o schema apontado por `.env.test` e reaplica todas as migrations. Uma
trava aborta a suíte se o nome do banco não terminar em `_test`. Preview, E2E e Production devem
usar bancos ou projetos separados.

## Banco, migrations e concorrência

Os schemas Drizzle ficam junto dos serviços em
`src/services/<serviço>/infra/database/schema/`. As migrations SQL e o journal do migrator são
versionados em `drizzle/` e devem ser aplicados na ordem `0000` a `0009`:

| Faixa         | Conteúdo                                                              |
| ------------- | --------------------------------------------------------------------- |
| `0000`–`0002` | schema inicial, exclusão de double-booking e Better Auth multi-tenant |
| `0003`–`0004` | Stripe, assinaturas, holds, checks e auditoria                        |
| `0005`–`0007` | rate limit distribuído, índices de relatórios e outbox de e-mail      |
| `0008`–`0009` | estado operacional da agenda e bloqueios de sala concorrentes         |

Migrations são operações administrativas one-shot. Em banco remoto, sua execução é explícita e
anterior ao deploy que depende delas; no Supabase local, `bun run dev` aciona o mesmo migrator antes
de abrir o servidor. Nos dois casos elas usam `DIRECT_DATABASE_URL` e nunca são executadas por
request, no entrypoint da Function ou durante cold start.

A prevenção de ocupação dupla é uma invariante do Postgres:

- `bookings_no_overlap` impede reservas sobrepostas na mesma sala;
- `room_blocks_no_overlap` impede bloqueios sobrepostos;
- o trigger `enforce_room_occupancy` serializa reservas e bloqueios pela linha da sala e impede a
  corrida entre as duas tabelas;
- intervalos são semiabertos `[startsAt, endsAt)`, portanto eventos adjacentes são válidos;
- violações `23P01` são traduzidas para HTTP 409, nunca para 500.

## Autenticação, RBAC e equipe

O tenant é a `organization` do Better Auth; `companies` guarda o perfil da empresa. Cadastro,
usuário, organização, vínculo `owner` e company nascem em uma transação por
`POST /api/v1/sign-up`.

A regra central é: **`companyId` vem de `request.auth`, nunca do body, query ou header.** A SPA usa
a matriz compartilhada de permissões para esconder ações, mas toda autorização é repetida no
backend.

| Papel     | Acesso resumido                                               |
| --------- | ------------------------------------------------------------- |
| `owner`   | operação completa, equipe, billing e relatórios               |
| `manager` | salas, agenda, bloqueios, convites e relatórios; sem billing  |
| `staff`   | leitura de salas/bloqueios e operação de reservas; sem gestão |

Convites são enviados pelo mesmo outbox de e-mail. Alterar ou remover o último `owner` é recusado.
Mutações de salas, agendas, reservas e bloqueios geram `audit_events` persistidos.

## API principal

```text
GET  /api/health
GET  /api/ready
GET/POST /api/auth/*

POST   /api/v1/sign-up
GET    /api/v1/me
GET    /api/v1/rooms
GET    /api/v1/bookings?date=YYYY-MM-DD
GET    /api/v1/bookings?weekStart=YYYY-MM-DD
POST   /api/v1/bookings
PATCH  /api/v1/bookings/:id/reschedule
POST   /api/v1/bookings/:id/check-in
POST   /api/v1/bookings/:id/check-out
POST   /api/v1/bookings/:id/no-show
GET    /api/v1/room-blocks?from=&to=&roomId=
POST   /api/v1/room-blocks
DELETE /api/v1/room-blocks/:id?scope=occurrence|series
GET    /api/v1/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
GET    /api/v1/reports.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
```

A superfície do wizard, sem sessão, fica sob `/api/v1/public/:companySlug` e tem rate limit
próprio compartilhado entre todas as Functions:

```text
GET  /api/v1/public/:companySlug
GET  /api/v1/public/:companySlug/rooms
GET  /api/v1/public/:companySlug/rooms/:roomId/availability?date=YYYY-MM-DD
POST /api/v1/public/:companySlug/bookings
GET  /api/v1/public/:companySlug/checkout-sessions/:sessionId
POST /api/v1/public/bookings/cancel
```

A disponibilidade combina agenda, reservas ativas e bloqueios. Datas de negócio atravessam a API
em ISO 8601 com offset explícito no fuso IANA da empresa; preço e limites de plano são sempre
recalculados no servidor.

## Jobs externos

Não existe worker residente, `setInterval` nem processamento fire-and-forget. Configure Supabase
Cron ou outro scheduler externo:

| Endpoint                                    | Frequência recomendada | Função                                                           |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `POST /api/v1/jobs/expire-pending-bookings` | a cada minuto          | cancela holds vencidos de forma idempotente                      |
| `POST /api/v1/jobs/process-email-outbox`    | a cada minuto          | adquire eventos vencidos com lease, envia e aplica retry/backoff |
| `POST /api/v1/jobs/cleanup-rate-limits`     | a cada 5 minutos       | remove até 10.000 janelas expiradas por lote                     |

Os três exigem `Authorization: Bearer <CRON_SECRET>`. O scheduler deve aceitar entrega
at-least-once: os jobs, a deduplicação e o progresso vivem no Postgres. A expiração lazy nas
leituras/criações protege os horários mesmo se o scheduler atrasar. A limpeza impede crescimento
indefinido de `api_rate_limits` causado por chaves que não voltam a receber tráfego. O Vercel Cron
do plano Hobby não tem frequência suficiente para holds de aproximadamente 30 minutos; use
Supabase Cron ou equivalente.

## Deploy na Vercel

`vercel.json` define Bun `1.x`, instala com lockfile congelado, executa `bun run build`, publica
`dist/web`, encaminha `/api/*` a `api/server.ts` e aplica fallback da SPA somente fora de `/api`.
O wrapper prepara uma instância Fastify por isolate quente e nunca chama `listen()`.

Checklist de Production:

1. Crie o projeto Supabase na região mais próxima possível da Function e obtenha as duas URLs de
   conexão.
2. Configure os secrets abaixo separadamente em Preview e Production.
3. Aplique `bun run db:migrate` com `DIRECT_DATABASE_URL` antes do deploy do código.
4. Cadastre no Stripe o webhook `https://<domínio>/api/v1/webhooks/stripe` e copie o signing secret.
5. Configure os três jobs externos com o mesmo `CRON_SECRET` da Function.
6. Verifique `/api/health`, `/api/ready`, login, webhook Stripe e uma execução de cada job.
7. Monitore logs por `requestId`, cold starts, latência do banco, 429/5xx, backlog/dead letters do
   outbox e atraso de expiração dos holds.

Variáveis de produção:

| Variável                                                | Uso                                                       |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `NODE_ENV=production`                                   | ativa validações, cookies seguros, HSTS e proxy confiável |
| `APP_URL`, `BETTER_AUTH_URL`                            | origem HTTPS pública do deployment                        |
| `DATABASE_URL`                                          | Supavisor Transaction pooler `:6543`, com TLS             |
| `DIRECT_DATABASE_URL`                                   | migrations/Drizzle Kit; não é usada por requests          |
| `BETTER_AUTH_SECRET`                                    | assinatura de sessão, distinto por ambiente               |
| `CORS_ALLOWED_ORIGINS`                                  | origens adicionais, se realmente necessárias              |
| `LOG_LEVEL`                                             | nível dos logs estruturados                               |
| `GLOBAL_RATE_LIMIT_MAX`, `GLOBAL_RATE_LIMIT_WINDOW_MS`  | teto global distribuído                                   |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`            | API e assinatura do webhook Stripe                        |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`              | Price IDs das assinaturas                                 |
| `CRON_SECRET`                                           | autenticação dos jobs, mínimo de 32 caracteres            |
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | entrega de e-mails                                        |
| `BOOKING_CANCELLATION_SECRET`                           | HMAC dos links públicos de cancelamento                   |

Nenhuma variável server-side pode receber prefixo `VITE_`. Rotacionar
`BOOKING_CANCELLATION_SECRET` invalida links emitidos; rotacionar `BETTER_AUTH_SECRET` invalida
sessões.

## Frontend e CI

A SPA React 19 usa React Router 7 e valida todas as respostas com os contratos Zod de
`src/shared`. As telas administrativas cobrem salas/agendas, bloqueios, calendário, equipe,
cobrança e relatórios. O fluxo público cobre wizard, retorno do Checkout e cancelamento explícito
por link assinado.

Todo push e pull request para `main` executa [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
com lint, typecheck, testes de backend/frontend e E2E contra Postgres efêmero isolado. Esse banco
de CI não representa a topologia de produção.

## Estrutura

```text
api/server.ts      # adaptador Vercel -> Fastify, sem listen()
drizzle/           # migrations SQL e metadados Drizzle
src/shared/        # contratos Zod, enums e matriz de permissões
src/services/      # módulos backend: domain/application/infra
src/web/           # SPA React
dist/web/          # saída gerada pelo Vite
```
