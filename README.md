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

Esse comando faz tudo: instala dependências, garante o `.env`, sobe o Postgres via Docker, espera o banco ficar pronto, roda as migrations, inicia a API com hot reload em `http://localhost:3000` e o frontend (Vite) em `http://localhost:5173`.

Verifique se subiu com:

```bash
curl http://localhost:3000/health   # API direta
curl http://localhost:5173/health   # mesma resposta, via proxy do Vite
```

O proxy do Vite (`vite.web.config.ts`) cobre `/api` e `/health`: a SPA fala com a API pelo mesmo host da própria SPA, sem CORS manual em dev.

## Outros comandos

```bash
bun run lint          # ESLint (backend e frontend)
bun run typecheck     # tsc --noEmit (backend e frontend)
bun run test          # testes unitários do backend (Vitest)
bun run test:web      # testes de render dos componentes do frontend (Vitest + jsdom)
bun run test:e2e      # testes end-to-end contra o Postgres (usa .env.test)
bun run build:web     # build de produção da SPA em dist/web
bun run db:generate   # gera uma migration a partir dos schemas Drizzle
bun run db:migrate    # aplica as migrations pendentes
bun run db:studio     # abre o Drizzle Studio
```

`bun run test:e2e` é destrutivo: ele derruba o schema do banco apontado por `.env.test` e reaplica todas as migrations antes de rodar.
Existe uma trava que aborta a execução se o banco não terminar com `_test`.

`bun run db:studio` depende de um driver Node (`pg` ou `postgres`), que o projeto não instala.
O restante do fluxo de banco usa o driver nativo do Bun.

## CI

Todo push e pull request para `main` roda em [`.github/workflows/ci.yml`](.github/workflows/ci.yml), com quatro jobs em paralelo: `lint`, `typecheck`, `test` (unitários de backend e de frontend) e `test-e2e` (contra um Postgres efêmero de serviço, nas mesmas credenciais de `.env.test`).
Não há passo manual: o job de e2e sobe o banco, aplica as migrations do zero e roda a suíte, exatamente como localmente.

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

GET /api/v1/public/:companySlug                            # perfil público da empresa
GET /api/v1/public/:companySlug/rooms                       # só salas ativas, campos públicos
GET /api/v1/public/:companySlug/rooms/:roomId/availability?date=YYYY-MM-DD
```

As quatro rotas sob `/api/v1/public/:companySlug` (as duas acima mais as de reservas, adiante) não têm sessão: o tenant vem do slug da URL, resolvido uma única vez por um `preHandler` compartilhado, com rate limit próprio.
O porquê e o desenho completo estão em [`docs/architecture.md`](docs/architecture.md).

A rota de disponibilidade é o passo 2 do wizard, consumido por quem ainda não tem conta.
Ela devolve a grade do dia no fuso da empresa, em ISO 8601 com offset explícito, com o preço de cada slot proporcional à tarifa horária da sala.

Sala sem agenda cadastrada para aquele dia é tratada como fechada, nunca como aberta 24h.
Sala inativa ou de outra empresa responde 404.

A grade avança em tempo real, não em horário de parede, para que os dias de transição de horário de verão não dupliquem nem percam slots.
O raciocínio completo, o arredondamento de preço e o tratamento das horas inexistente e ambígua estão em [`docs/architecture.md`](docs/architecture.md).

## Reservas

```text
POST   /api/v1/public/:companySlug/bookings   # passo 4 do wizard, sem sessão
GET    /api/v1/bookings?from=&to=&roomId=     # agenda da empresa no período, atrás de requireAuth
DELETE /api/v1/bookings/:id                   # cancela e devolve o horário para a grade
```

A prevenção de double-booking não é feita pela aplicação: ela não consulta a disponibilidade antes de gravar, porque isso só moveria a corrida para a janela entre o `SELECT` e o `INSERT`.
Quem arbitra é a constraint `bookings_no_overlap`, e o `23P01` vira `409` com `code: BOOKING_CONFLICT`.
N requisições simultâneas para o mesmo horário produzem exatamente uma reserva, e o teste de concorrência em `test/services/bookings/booking.e2e-spec.ts` prova isso contra o Postgres.

`total_in_cents` é sempre calculado no servidor, a partir da tarifa da sala e da grade do dia; um preço enviado no corpo é descartado na validação.
Horário fora da janela de funcionamento, fora das bordas da grade ou já iniciado responde `422`.

Cancelar não apaga a linha: o `status` vira `cancelled`, a reserva sai do índice da constraint e o horário volta para a grade, preservando o histórico.

## Frontend

SPA em React 19 + React Router 7, servida pelo Vite (`vite.web.config.ts`) em dev e buildada para `dist/web` em produção - o Fastify não serve os assets, só a API.

```text
src/web/
  index.html
  src/
    main.tsx, app.tsx         # bootstrap e composição de providers/router
    index.css                 # Tailwind v4 + tokens de design (claro/escuro via classe .dark)
    components/                # base estilo shadcn: Button, Input, Label, Card, Badge,
                                # Skeleton, Dialog (Radix), Toast (contexto próprio)
    layouts/                   # PublicBookingLayout (/:companySlug/agendar) e AdminLayout
                                # (/admin/*, com guard de sessão via useSession)
    routes/                    # árvore de rotas, página 404
    providers/                 # ErrorBoundary
    lib/                       # api.ts (client HTTP tipado com Zod), auth-client.ts
```

O client HTTP (`@web/lib/api`) sempre valida a resposta contra um schema de `src/shared` e converte erro HTTP em `ApiRequestError` (com `status` e o `ApiError` do backend) ou `ApiTransportError` (rede ou contrato incompatível) - nenhuma tela precisa parsear `response.json()` na mão.

Testes de componente ficam em `test/web/**/*.spec.tsx`, com Testing Library sobre jsdom (`vitest.web.config.ts`), independentes da suíte de backend.

## Estrutura

```text
src/
  shared/     # Contratos Zod, enums e tipos compartilhados entre backend e frontend
  services/   # Módulos de backend (domain / application / infra por serviço)
  web/        # SPA React
```
