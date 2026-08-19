# Plano executado: Meet Flow Serverless

Atualizado em 19 de agosto de 2026.

Este documento registra o resultado da migração e das entregas funcionais `#14` a `#22`. O código
e a documentação estão preparados para produção; a publicação efetiva depende somente das
credenciais e dos recursos externos de cada ambiente (Vercel, Supabase, Stripe, Resend e
scheduler).

## 1. Resultado

- **Frontend:** React 19 + Vite, build estático em `dist/web`, servido pela CDN da Vercel.
- **Backend:** Fastify em uma única Vercel Function com runtime Bun, sem `listen()` em produção.
- **Banco:** Supabase Postgres gerenciado em produção; Supabase CLI local no desenvolvimento padrão.
- **Persistência:** Drizzle ORM compartilhado com o adapter do Better Auth.
- **Pagamentos:** Stripe Checkout, Billing Portal e webhook transacional/idempotente.
- **E-mail:** outbox Postgres, processamento por job externo e adapter Resend.
- **Segurança:** RBAC central, auditoria, Helmet/CORS, rate limit distribuído e logs estruturados.

```text
Browser
  ├── /api/* ───────────────> Vercel Function (Bun) ──> Fastify
  │                                                     ├── Better Auth
  │                                                     ├── Stripe/Resend
  │                                                     └── Drizzle ORM
  │                                                            │
  │                                             Supavisor transaction :6543
  │                                                            │
  │                                                   Supabase Postgres
  └── demais caminhos ──────> Vercel CDN ───────> dist/web + fallback SPA

Supabase Cron/scheduler ────> /api/v1/jobs/* (Bearer CRON_SECRET)
Stripe ─────────────────────> /api/v1/webhooks/stripe (assinatura raw body)
```

“100% Serverless” significa compute sob demanda na Vercel e serviços gerenciados para estado. O
Postgres não é efêmero: Supabase/Supavisor é a fronteira durável que absorve a variação de
instâncias da Function.

## 2. Migração de infraestrutura concluída

### Passo 1 — documentação

- `docs/plano.md` e `docs/architecture.md` descrevem a topologia Vercel/Supabase.
- Cold starts, statelessness, jobs externos e abandono do Docker de produção estão explícitos; o
  único uso local de Docker é a stack controlada pelo Supabase CLI.
- TODOs e critérios de issues herdados do processo contínuo foram revisados.

### Passo 2 — build e roteamento Vercel

- `vercel.json` fixa Bun `1.x`, build `bun run build` e output `dist/web`.
- `/api` e `/api/*` são reescritos para `api/server.ts`.
- O fallback para `index.html` cobre somente a SPA; uma API inexistente não recebe HTML.
- O build de produção não inicia servidor e não inclui secrets no bundle Vite.

### Passo 3 — Drizzle, Better Auth e Supabase

- `DATABASE_URL` usa o Transaction pooler `:6543`, TLS, `prepare: false` e pool local pequeno.
- `DIRECT_DATABASE_URL` é exclusiva de Drizzle Kit, migrations, seed e manutenção one-shot.
- Drizzle e Better Auth compartilham a mesma instância de runtime e transações Postgres.
- Migrations nunca rodam em import, cold start ou request.
- No desenvolvimento padrão, `bun run dev` sobe/reutiliza o Supabase local e aplica Drizzle antes
  do preflight; em `DEV_DATABASE_MODE=remote`, migration automática é proibida.

### Passo 4 — Fastify Serverless

- `api/server.ts` cria e prepara o Fastify uma vez por isolate quente.
- Cada invocação aguarda o término real da resposta encaminhada ao servidor HTTP interno.
- `server.listen()` ficou restrito a `src/services/http/local.ts`.
- `/api/health` é liveness sem estado; `/api/ready` verifica o Postgres e retorna 503 sanitizado.

## 3. Entregas funcionais concluídas

| Issue | Estado | Entrega implementada |
| --- | --- | --- |
| `#14` | concluída | Reserva pública com hold de 31 minutos, Stripe Checkout, retorno consultável, webhook com raw body e ledger idempotente; total zero confirma sem Stripe. |
| `#15` | concluída | Planos versionados `free`/`starter`/`pro`, checkout de assinatura, portal, sincronização fora de ordem e gating server-side de salas, usuários e reservas. |
| `#16` | concluída | RBAC `owner`/`manager`/`staff`, equipe, convites com validade, aceite/cadastro, proteção do último owner e auditoria persistente das mutações operacionais. |
| `#17` | concluída | Agenda diária/semanal, reserva manual, reagendamento, check-in/out com horários reais, confirmação fora da janela e estado `no_show`. |
| `#18` | concluída | Relatório agregado por tenant/período, ocupação, receita, ticket, cancelamento, pico e exportação CSV; período máximo de 366 dias. |
| `#19` | concluída | Outbox transacional, lease, `SKIP LOCKED`, backoff, dead letter, Resend, lembrete, convites e cancelamento por token HMAC. |
| `#20` | concluída | Helmet, CORS allowlist, cookies seguros, request ID, logs Pino com redaction, no-store autenticado, liveness/readiness e rate limit Postgres fail-closed. |
| `#21` | concluída | Bloqueios avulsos/diários/semanais, remoção por ocorrência/série, UI própria e exclusão concorrente entre bloqueios e reservas. |
| `#22` | concluída | Consolidação Serverless das entregas filhas, migrations, documentação e validação integrada. |

## 4. Regras Serverless aplicadas

### Statelessness

Nenhuma regra de correção depende de memória, disco local, PID, uptime ou de uma instância quente.

| Estado | Persistência durável |
| --- | --- |
| sessão, tenant e papéis | Better Auth + Supabase Postgres + cookie assinado |
| reservas, holds, check-in/out e bloqueios | tabelas Postgres e constraints/triggers |
| assinaturas e eventos Stripe | `subscriptions` e `stripe_events` |
| e-mails, tentativas e leases | `email_outbox` |
| limites globais/públicos | `api_rate_limits` |
| auditoria | `audit_events` |

Não há `setInterval`, worker residente ou Promise crítica solta após a resposta. Reexecução por
timeout, retry ou entrega duplicada é esperada e tratada com condições atômicas, deduplicação e
transações.

### Cold starts

- Fastify, plugins, Better Auth e o cliente Drizzle são inicializados em escopo de módulo.
- `app.ready()` é compartilhado dentro do isolate e nunca abre uma porta.
- Migrations, seeds e chamadas de descoberta remota ficam fora do caminho de importação.
- O pool é reutilizado quando a instância está quente, mas a aplicação funciona sem esse reuso.
- Liveness não toca o banco; readiness faz somente uma consulta curta.
- Operação deve separar latência cold/warm e acompanhar conexões/latência do Supabase.

### Concorrência

- `bookings_no_overlap` arbitra reservas concorrentes por sala.
- `room_blocks_no_overlap` arbitra bloqueios concorrentes.
- `enforce_room_occupancy` usa a linha de `rooms` como mutex transacional durável para serializar a
  corrida entre as duas tabelas.
- A disponibilidade pública combina reservas ativas e bloqueios, mas a leitura nunca substitui as
  invariantes de escrita do banco.
- Stripe, jobs e outbox suportam entrega at-least-once.

## 5. Migrations

Os arquivos SQL e `drizzle/meta/_journal.json` formam uma unidade versionada. A ordem atual é:

| Ordem | Arquivo | Finalidade |
| --- | --- | --- |
| `0000` | `0000_initial_schema.sql` | empresas, salas, agendas e reservas |
| `0001` | `0001_booking_no_overlap.sql` | range semiaberto e exclusão de double-booking |
| `0002` | `0002_auth_multi_tenant.sql` | Better Auth, organizations e memberships |
| `0003` | `0003_stripe_billing.sql` | holds, ledger Stripe e assinaturas |
| `0004` | `0004_snapshot_checks.sql` | checks de billing e `audit_events` |
| `0005` | `0005_serverless_hardening.sql` | `api_rate_limits` distribuído |
| `0006` | `0006_reports_indexes.sql` | índices parciais para relatórios |
| `0007` | `0007_email_outbox.sql` | outbox, enums, trigger e índices de entrega |
| `0008` | `0008_calendar_operations.sql` | `no_show`, `checked_in_at` e `checked_out_at` |
| `0009` | `0009_room_blocks.sql` | bloqueios, recorrência materializada e invariantes cruzadas |

### Desenvolvimento local

O caminho padrão é `DEV_DATABASE_MODE=local`. `bun run dev` requer Bun e um runtime Docker
compatível, verifica o estado do Supabase CLI, inicia a stack quando necessário, aplica a cadeia de
migrations Drizzle, executa o preflight e então abre Fastify watch + Vite. O Supabase CLI é apenas o
provedor da infraestrutura local; não existe uma segunda fonte de migrations além de `drizzle/`.

Interromper `bun run dev` encerra API e frontend, mas preserva a stack para acelerar a próxima
sessão. Seu ciclo de vida é explícito:

```bash
bun run db:local:start
bun run db:local:status
bun run db:local:stop
```

Aplicar migrations nessa orquestração não muda a regra Serverless: o migrator é um processo
one-shot anterior ao servidor e nunca é chamado pelo entrypoint, import, request ou cold start.
Docker permanece proibido em produção e existe somente como requisito do Supabase CLI local.

### Ambientes remotos

`DEV_DATABASE_MODE=remote` preserva as URLs remotas configuradas, não inicia stack local e **nunca
aplica migrations automaticamente**. O procedimento para qualquer banco remoto é:

1. selecione `DIRECT_DATABASE_URL` do banco correto e confirme que não é Production ao preparar
   Preview/E2E;
2. faça backup/ponto de recuperação antes de uma mudança de produção;
3. execute `bun run db:migrate` uma única vez;
4. publique o código que depende da nova versão;
5. valide `/api/ready` e os fluxos afetados;
6. faça correções por migration aditiva/roll-forward, sem editar SQL já aplicado.

`db:generate` é ferramenta de desenvolvimento, não passo automático de deploy. `DATABASE_URL`
pooled não substitui a conexão administrativa para DDL.

## 6. Jobs externos e pagamentos

Configure Supabase Cron ou scheduler HTTP equivalente:

| Endpoint | Frequência | Propriedade operacional |
| --- | --- | --- |
| `POST /api/v1/jobs/expire-pending-bookings` | a cada minuto | idempotente; expira holds vencidos e devolve a quantidade alterada |
| `POST /api/v1/jobs/process-email-outbox` | a cada minuto | reclama lote com lease; registra sent/retry/dead e nunca depende da vida da Function |
| `POST /api/v1/jobs/cleanup-rate-limits` | a cada 5 minutos | apaga até 10.000 janelas expiradas e devolve `deleted` |

Requisitos dos três jobs:

- header `Authorization: Bearer <CRON_SECRET>`;
- `CRON_SECRET` aleatório, por ambiente, com pelo menos 32 caracteres;
- timeout e retry do scheduler habilitados;
- alertas para falha consecutiva, atraso de execução e crescimento de itens `dead`;
- nenhum acesso do scheduler a `DIRECT_DATABASE_URL`.

A limpeza é stateless e idempotente: exclui somente contadores cujo `expires_at` já passou. Lotes
concorrentes usam `FOR UPDATE SKIP LOCKED`; sem o job, IPs/chaves que aparecem uma única vez
deixariam linhas expiradas acumularem indefinidamente.

O hold público dura 31 minutos. A aplicação também expira holds de forma lazy antes de consultar ou
criar ocupação, portanto atraso do scheduler não mantém um slot falsamente indisponível. O Vercel
Cron do plano Hobby não oferece a frequência necessária; por isso o desenho operacional usa
Supabase Cron ou outro scheduler externo.

O Stripe deve chamar `POST /api/v1/webhooks/stripe`. A assinatura é verificada sobre o corpo bruto;
o id do evento é a chave do ledger e a mutação correspondente ocorre na mesma transação. Eventos
duplicados ou fora de ordem não revertem estado mais novo.

## 7. Checklist de deploy

### Supabase

- projeto e banco distintos por Development, Preview e Production;
- região próxima à Vercel;
- `DATABASE_URL` no Transaction pooler `:6543` com TLS;
- `DIRECT_DATABASE_URL` direta ou Session pooler `:5432` para tarefas one-shot;
- migrations `0000`–`0009` aplicadas antes do tráfego;
- extensões/constraints, RLS e revogações verificadas.

### Vercel

- `NODE_ENV=production`;
- `APP_URL` e `BETTER_AUTH_URL` apontando para a mesma origem HTTPS;
- secrets configurados por ambiente, sem prefixo `VITE_`;
- função na região mais próxima do Supabase;
- build produz `dist/web` e uma rota profunda da SPA abre corretamente;
- `/api/health`, `/api/ready`, `/api/auth/*` e `/api/v1/*` passam pelo wrapper.

### Integrações

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER` e
  `STRIPE_PRICE_PRO` configurados;
- webhook Stripe apontando para a URL de produção;
- `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` com domínio verificado;
- `BOOKING_CANCELLATION_SECRET` e `BETTER_AUTH_SECRET` distintos e estáveis;
- Supabase Cron/scheduler configurado para os três endpoints internos.

### Segurança e observabilidade

- `CORS_ALLOWED_ORIGINS` vazio quando somente a mesma origem é necessária;
- `GLOBAL_RATE_LIMIT_MAX` e `GLOBAL_RATE_LIMIT_WINDOW_MS` calibrados com tráfego real;
- logs disponíveis por `requestId`, sem cookies, Authorization, senhas, tokens ou secrets;
- alertas de 5xx, readiness 503, 429, latência, cold starts, falha de webhook e backlog do outbox;
- smoke test de login, booking/checkout, webhook, equipe, agenda, bloqueios, relatório e cancelamento.

## 8. Validação da base

Antes de promover um release:

```bash
bun run lint
bun run typecheck
bun run test
bun run test:web
bun run test:e2e
bun run build
git diff --check
```

O E2E precisa de um Postgres isolado cujo nome termine em `_test`; falha de credencial ou ausência
desse banco não deve ser contornada apontando a suíte para Production.

## 9. Revisão de TODOs e critérios antigos

A busca de 19 de agosto de 2026 não encontrou comentários literais `TODO`, `FIXME`, `HACK` ou
`XXX` no código. Os itens conceituais herdados foram resolvidos assim:

- rate limit em memória foi substituído por `api_rate_limits` no Postgres, com limpeza externa de
  janelas expiradas;
- `GET /health` com uptime foi substituído por liveness/readiness sob `/api`;
- Dockerfile de produção e graceful shutdown saíram do escopo Serverless; Docker voltou somente
  como dependência local do Supabase CLI;
- fila simples virou outbox durável com lease e backoff;
- timers de hold/e-mail viraram endpoints idempotentes acionados externamente;
- referências históricas a “MVP-08” para pagamentos e “MVP-11” para RBAC foram substituídas pelas
  issues `#14` e `#16`.

## 10. Referências técnicas

- [Vercel: Fastify](https://vercel.com/docs/frameworks/backend/fastify)
- [Vercel: runtime Bun](https://vercel.com/docs/functions/runtimes/bun)
- [Vercel: Functions](https://vercel.com/docs/functions)
- [Supabase: conexão com Postgres e Supavisor](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Drizzle: conexão com Supabase](https://orm.drizzle.team/docs/connect-supabase)
