# Arquitetura

Complemento do [`plano.md`](plano.md) com as decisões arquiteturais que todos os módulos
precisam respeitar. A topologia de produção é Serverless: Vercel para compute e frontend estático,
Supabase para Postgres gerenciado e Supavisor para pooling.

## Topologia de produção

```text
                         mesma origem HTTPS
Browser ───────────────────────────────────────────────────────────────┐
  │                                                                   │
  ├── /api/* ──> rewrite Vercel ──> /api/server.ts ──> Fastify        │
  │                                                   ├── /api/health │
  │                                                   ├── /api/auth/* │
  │                                                   └── /api/v1/*   │
  │                                                          │        │
  │                                                Drizzle + Better Auth
  │                                                          │
  │                                       Supavisor transaction pool :6543
  │                                                          │
  │                                                  Supabase Postgres
  │
  └── assets/rotas SPA ──> Vercel CDN ──> dist/web
```

A API inteira é uma única Vercel Function; o roteador do Fastify continua sendo a fonte de verdade
para os subcaminhos. O rewrite preserva a URL pública original para que `/api/v1/rooms` não vire
`/api/server/v1/rooms` nem receba um segundo prefixo `/api`.

O fallback para `dist/web/index.html` só vale para caminhos que não começam por `/api`. Assim,
uma API inexistente responde 404 da API e nunca HTML com status 200. Frontend e backend usam a
mesma origem; o browser não recebe `DATABASE_URL`, credenciais Supabase ou segredos do Better
Auth.

Integrações externas não alteram essa borda: Stripe chama o webhook sob `/api/v1`, Resend é chamado
somente pelo processador do outbox e Supabase Cron/scheduler chama endpoints autenticados de job.
Nenhuma delas acessa diretamente a SPA ou recebe credenciais administrativas do banco.

### Runtime e ciclo de vida da Function

A Vercel executa o entrypoint no runtime Bun configurado por `bunVersion: "1.x"`. O entrypoint
importa `buildServer()`, prepara o Fastify uma vez e encaminha os objetos HTTP da invocação para
`app.server`. Ele não chama `listen()`: não existe porta pertencente à aplicação em produção.
`listen()` fica restrito ao bootstrap local.

Inicialização em escopo de módulo é uma otimização segura:

1. um cold start avalia os módulos, cria Fastify, Better Auth e o cliente Drizzle;
2. uma Promise compartilhada executa `app.ready()` no máximo uma vez naquela instância;
3. invocações quentes reaproveitam app e conexões quando a Vercel mantiver a instância viva;
4. outra instância pode nascer a qualquer momento e repetir a inicialização.

Nenhuma regra depende do passo 3. A plataforma pode congelar ou destruir a instância sem hook de
shutdown, e duas ou mais instâncias podem atender requests concorrentes.

### Cold starts

A primeira invocação de uma instância pode ter latência adicional. Para manter esse custo
controlado:

- migrations, seeds e chamadas de descoberta externa não rodam na importação nem no handler;
- imports e plugins registrados no caminho crítico devem permanecer mínimos;
- cliente de banco e Fastify não são recriados por request;
- health check de liveness não consulta serviços externos;
- readiness de banco usa uma query mínima sobre o marcador e o hash da migration mais recente;
- latência de cold e warm invocation deve ser medida separadamente na observabilidade.

Cold start nunca é tratado com estado global obrigatório ou keep-alive artificial.

### Statelessness

Memória e filesystem da Function são efêmeros. O cache de `Intl.DateTimeFormat` usado pelo cálculo
de fuso, por exemplo, é permitido porque pode desaparecer sem mudar o resultado. Em contraste, os
seguintes dados precisam ser duráveis:

| Dado | Onde vive |
| --- | --- |
| Sessão, tenant ativo e credenciais | Better Auth + Supabase Postgres/cookie assinado. |
| Reservas, assinaturas, check-in/out e bloqueios | Supabase Postgres. |
| Idempotência de webhook e jobs | Tabelas com chaves únicas no Postgres. |
| Outbox/fila de e-mail | `email_outbox` no Postgres, com lease, backoff e entrega registrada. |
| Rate limits global e público | `api_rate_limits` no Postgres, compartilhado por todas as instâncias. |
| Auditoria operacional | `audit_events` no Postgres. |
| Arquivos permanentes | Object storage, nunca `/tmp` da Function. |

Não se usa `setInterval`, worker residente nem Promise fire-and-forget depois de enviar a resposta.
Supabase Cron ou outro scheduler externo pode disparar endpoints internos autenticados, mas o
progresso, a aquisição de trabalho e as retentativas continuam persistidos. O Vercel Cron do plano
Hobby não tem frequência suficiente para holds de aproximadamente 30 minutos. Toda mutação que
possa ser repetida por timeout, retry ou webhook crítico usa chave de deduplicação ou condição
atômica e, quando altera múltiplas linhas, uma transação.

## Banco de dados no Supabase

### Duas conexões, dois propósitos

| Variável | Modo | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Supavisor transaction mode, normalmente `:6543` | Tráfego da Vercel Function. |
| `DIRECT_DATABASE_URL` | Direct `:5432` ou Session pooler compatível | Drizzle Kit, migrations, seed e manutenção. |

O cliente de runtime é criado uma vez por módulo com pool local conservador e
`prepare: false`. O transaction pooler compartilha conexões físicas entre transações, portanto o
código não usa prepared statements nomeados, tabelas temporárias dependentes de sessão, `SET`
persistente ou qualquer afinidade com uma conexão entre transações.

TLS é obrigatório em toda conexão remota. A stack local do Supabase CLI é a única exceção: seus
endpoints ficam no loopback e são descobertos pelo orquestrador de desenvolvimento. Strings remotas
são secrets server-side configuradas separadamente em Development, Preview e Production e nunca
usam prefixo `VITE_`. A Function deve ficar na região Vercel mais próxima possível do projeto
Supabase.

### Drizzle e Better Auth

Drizzle continua sendo a única fronteira SQL da aplicação. O adapter do Better Auth recebe a mesma
instância `db` e mantém `provider: "pg"` e `transaction: true`; cadastro de usuário,
organização, membership e company continua atômico. A ausência de afinidade de sessão no pooler não
quebra uma transação individual, que permanece presa à mesma conexão até commit ou rollback.

As constraints do Postgres continuam sendo a autoridade para invariantes concorrentes. A extensão
`btree_gist`, as constraints `bookings_no_overlap`/`room_blocks_no_overlap` e o trigger
`enforce_room_occupancy` precisam existir no projeto Supabase antes de receber tráfego.

### Migrações, desenvolvimento e testes

Migrations são executadas por um processo administrativo one-shot, nunca pelo entrypoint Fastify,
por import, request, rota pública ou cold start. O migrator abre a conexão administrativa, aplica os
arquivos versionados de `drizzle/`, compara toda a cadeia por timestamp e hash e fecha somente esse
cliente. Em ambientes remotos, o passo é sempre explícito e anterior ao deploy que depende dele; no
modo local, o orquestrador de `bun run dev` executa o mesmo migrator antes de iniciar a API.

O SQL e `drizzle/meta/_journal.json` formam uma unidade. A cadeia `0000`–`0009` cobre, nessa ordem,
schema base, exclusão de reservas, Better Auth multi-tenant, Stripe/billing, checks/auditoria,
hardening Serverless, índices de relatórios, outbox, calendário operacional e bloqueios de sala.
Uma versão de aplicação só recebe tráfego depois que todas as migrations das quais depende foram
aplicadas com `DIRECT_DATABASE_URL`. Arquivo já aplicado não é reescrito; correção usa migration
aditiva e roll-forward.

#### Desenvolvimento local padrão

`DEV_DATABASE_MODE=local` é o padrão de `bun run dev`. Ele exige Bun e um runtime Docker compatível
porque o Supabase CLI usa containers para oferecer localmente Postgres e os demais serviços da
stack. O fluxo de inicialização é ordenado e falha antes de expor a aplicação quando alguma etapa
não passa:

1. validar Bun, Supabase CLI e o runtime Docker;
2. consultar a stack local e iniciá-la somente quando necessário;
3. obter as conexões locais de runtime e administração;
4. aplicar a cadeia Drizzle `0000`–`0009` pela conexão administrativa;
5. executar o preflight de conectividade e versão do schema;
6. iniciar Fastify em modo watch e o Vite com proxy de `/api`.

Drizzle permanece o único sistema de migrations; o Supabase CLI fornece a infraestrutura local,
mas não mantém uma segunda cadeia SQL. A etapa 4 pertence ao launcher de desenvolvimento e não ao
ciclo de vida do servidor, portanto não executa migration em cold start. `Ctrl+C` encerra API e Vite,
mas deliberadamente não derruba a stack: ela pode ser reutilizada no próximo `bun run dev`.
`bun run db:local:start`, `bun run db:local:status` e `bun run db:local:stop` permitem controlar essa
stack explicitamente.

Docker termina nessa fronteira. Não existe Dockerfile de produção, a aplicação não é publicada em
container próprio e Vercel/Supabase gerenciado continuam sendo a única topologia de produção.

#### Desenvolvimento com banco remoto

`DEV_DATABASE_MODE=remote` é opt-in. Nesse modo o launcher preserva `DATABASE_URL` e
`DIRECT_DATABASE_URL`, não inicia nem consulta a stack local e **nunca executa migrations
automaticamente**. Depois de confirmar o projeto remoto selecionado, a pessoa responsável aplica
`bun run db:migrate` explicitamente. Esse limite evita que simplesmente abrir o ambiente de
desenvolvimento altere um banco compartilhado, de Preview ou de Production.

Preview e E2E usam projetos/bancos isolados; a suíte E2E é destrutiva e jamais recebe credenciais de
produção. Um Postgres efêmero pode continuar no CI como detalhe isolado de testes de compatibilidade,
sem representar a topologia publicada.

## Roteamento e saúde

- `GET /api/health` é liveness sem estado e não retorna `process.uptime()`, pois uptime de uma
  instância efêmera não mede disponibilidade.
- `GET /api/ready` valida timestamp e hash da migration mais recente no ledger do Drizzle; conexão
  indisponível ou schema desatualizado responde 503 sem vazar host, SQL ou credenciais.
- `/api/auth/*` continua sob Better Auth e `/api/v1/*` sob os plugins da aplicação.
- URLs profundas da SPA, como `/admin/agenda`, são resolvidas para `dist/web/index.html`.

## Multi-tenancy

### O modelo

O tenant é a `organization` do Better Auth.
O perfil de negócio (nome comercial, tipo, fuso) vive em `companies`, que referencia
`organization.id` em uma relação um-para-um, garantida por `companies_organization_id_unique`.

Não existe uma segunda tabela de usuários nem uma segunda noção de papel.
Usuário, sessão, credencial e vínculo (`member`) são as tabelas do Better Auth, geradas
pelo CLI dele e versionadas em `drizzle/`.

```text
user ──< member >── organization ──1:1── companies ──< rooms ──< bookings
```

`companies.id` é um `uuid` e é o que as tabelas de negócio referenciam.
`organization.id` é `text`, porque é o Better Auth quem gera o identificador.

### A regra dura

**`companyId` vem sempre de `request.auth`. Nunca do body, da query string ou de um header.**

`request.auth` é preenchido pelo `preHandler` `requireAuth`
(`src/services/identity/infra/http/require-auth.ts`), que valida a sessão, resolve a
organização ativa e devolve `{ userId, companyId, organizationId, role }`.

Aceitar `companyId` do cliente transformaria o isolamento entre empresas em uma sugestão:
bastaria trocar um campo do JSON para ler ou escrever dados de outro tenant.
Isso vale inclusive para rotas administrativas que "obviamente" só seriam chamadas pelo
dono da empresa.

Na prática, toda query de negócio filtra por `companyId` e toda escrita o grava a partir
de `request.auth`:

```ts
app.get("/rooms", { preHandler: requireAuth }, async (request) => {
  const { companyId } = getRequestAuth(request);

  return db.select().from(rooms).where(eq(rooms.companyId, companyId));
});
```

O banco reforça a regra onde consegue: `bookings` tem uma chave estrangeira composta
`(room_id, company_id) -> rooms(id, company_id)`, então uma reserva não consegue apontar
para uma sala de outra empresa nem por erro de aplicação.

### Cadastro

`POST /api/v1/sign-up` é o **único** caminho que cria usuário ou organização.

Ele grava `user`, `account`, `organization`, `member` e `companies` em uma única
transação do Postgres. Slug ou e-mail repetido devolve `409` e a transação inteira é
desfeita, então não sobra usuário sem empresa.

Os dois caminhos alternativos estão desligados na configuração do Better Auth
(`src/services/identity/infra/auth/`):

| Endpoint | Estado | Motivo |
| --- | --- | --- |
| `POST /api/auth/sign-up/email` | desligado (`emailAndPassword.disableSignUp`) | criaria usuário sem organização |
| `POST /api/auth/organization/create` | desligado (`allowUserToCreateOrganization: false`) | criaria organização sem `company` |

Os dois estados são cobertos por teste em `test/services/identity/auth.e2e-spec.ts`.
Se algum deles voltar a responder, passa a existir um usuário para o qual `requireAuth`
não consegue resolver `companyId`, e a resposta correta deixa de ser óbvia.

O restante de `/api/auth/*` (login, logout, sessão) é servido pelo handler do Better Auth,
montado em `src/services/identity/infra/http/auth-handler.ts`.

### RBAC

O papel do vínculo `member` é um conjunto fechado: `owner`, `manager` ou `staff`.
`can(role, action, resource)`, em `src/shared/auth/permissions.ts`, é a matriz única consumida
pelo backend e pela SPA. A SPA usa a matriz para esconder controles; a autorização real sempre é
repetida pelo preHandler no servidor.

| Recurso | owner | manager | staff |
| --- | --- | --- | --- |
| Salas e agendas | ler, criar, alterar e remover | ler, criar, alterar e remover | somente ler |
| Reservas | ler, criar, remarcar, operar e cancelar | ler, criar, remarcar, operar e cancelar | ler, criar, operar e cancelar |
| Bloqueios de sala | ler, criar, alterar e remover | ler, criar, alterar e remover | somente ler |
| Equipe | listar, convidar, alterar papel e remover | listar e convidar | sem acesso |
| Cobrança | ler e administrar | sem acesso | sem acesso |
| Relatórios | ler e exportar | ler e exportar | sem acesso |

Papéis desconhecidos são negados por padrão. O access control do plugin Organization do Better
Auth espelha as restrições de equipe, impedindo contorno por chamadas diretas a
`/api/auth/organization/*`. A superfície da aplicação e o Better Auth recusam alteração ou remoção
do último `owner`; a regressão é coberta por testes negativos.

Convites expiram em 48 horas. Owner pode listar, convidar, alterar papel e remover; manager pode
listar e convidar; staff não acessa gestão de equipe. O aceite valida estado, expiração, e-mail do
destinatário e limite do plano. Usuário inexistente pode criar credencial pelo caminho transacional
do convite. A entrega do convite entra no outbox genérico e nunca chama o provedor na request.

`audit_events` registra ator, tenant, ação, recurso, id e metadata de mutações em salas, agendas,
reservas e bloqueios. A auditoria é durável e multi-tenant; logs Pino complementam diagnóstico HTTP,
mas não substituem o histórico de negócio.

## API pública

### Uma superfície própria, separada da administrativa

O wizard de agendamento é usado por quem não tem conta, então ele não pode depender de
`requireAuth`.
Toda rota do wizard mora sob `/api/v1/public/:companySlug`, um plugin Fastify próprio
(`src/services/http/routes/public.ts`), composto a partir de controllers que já existem em
`companies`, `rooms` e `bookings`. O plugin não reimplementa domínio; ele dá a essas peças um
contrato de exposição mínimo e uma borda comum:

| Rota | O que devolve |
| --- | --- |
| `GET /api/v1/public/:companySlug` | Perfil público da empresa: `name`, `type`, `timezone`. |
| `GET /api/v1/public/:companySlug/rooms` | Só salas ativas, com o recorte de `PublicRoomResponseSchema`. |
| `GET /api/v1/public/:companySlug/rooms/:roomId/availability` | Grade que combina agenda, reservas e bloqueios. |
| `POST /api/v1/public/:companySlug/bookings` | Cria hold e Checkout, ou confirma total zero. |
| `GET /api/v1/public/:companySlug/checkout-sessions/:sessionId` | Estado sanitizado após retorno do Stripe. |

O cancelamento por token é público, mas não depende de tenant por slug:
`POST /api/v1/public/bookings/cancel` recebe somente o token HMAC emitido no e-mail.

### Slug é a única exceção à regra de `companyId`

`companyId` vem sempre de `request.auth`, exceto aqui: dentro do plugin `/public/:companySlug`,
um único `preHandler` (`createResolveCompanySlug`, em
`src/services/companies/infra/http/resolve-company-slug.ts`) resolve o slug da URL para uma
`Company` e a guarda em `request.publicCompany`.
Controllers leem esse valor com `getPublicCompany(request)`, o equivalente público de
`getRequestAuth`; nenhum deles consulta o `CompanyRepository` por conta própria, e nenhuma rota
sob este plugin aceita `companyId` vindo do corpo, da query string ou de um header.

Slug inexistente responde `404 COMPANY_NOT_FOUND` uma única vez, no `preHandler`, antes de
qualquer controller rodar.
Sala inativa ou de outra empresa continua respondendo o mesmo `404 ROOM_NOT_FOUND` de sala
inexistente - a distinção fica só no domínio, nunca na borda pública, para o endpoint não virar
oráculo de tenants ou salas alheias.

### Serializers explícitos

Cada resposta pública tem um schema e uma função de serialização própria, deliberadamente mais
estreitos que o modelo interno: `PublicCompanyResponseSchema` descarta `id` e `slug` (quem
consome já tem o slug na URL), e `PublicRoomResponseSchema` descarta `companyId`, `isActive`,
`createdAt` e `updatedAt`.
Nenhum dos dois reaproveita o schema do admin (`RoomResponseSchema`, `CompanyPublicSchema`) por
acidente de tipagem: são contratos diferentes, com campos diferentes de propósito.

### Rate limit

`@fastify/rate-limit` é registrado no escopo do plugin `/public/:companySlug`,
cobrindo as rotas públicas com um limite geral (`defaultPublicRateLimitConfig.general`).
`POST /bookings` sobrescreve esse limite via `config.rateLimit` na própria rota, o mecanismo do
plugin para dar a uma rota um contador independente do resto do escopo - é o limite mais
rígido do wizard, porque cria ocupação e inicia integração de pagamento.

O store padrão em memória não é usado. `PostgresRateLimitStore` incrementa atomicamente a tabela
`api_rate_limits` por `(scope, key_hash)` e janela, então duas Functions concorrentes observam o
mesmo contador. O IP é persistido somente como SHA-256, a tabela tem expiração indexada,
RLS/revogação para a Data API e falha do store é fail-closed. O hook raiz aplica ainda um teto
global; liveness/readiness ficam fora do contador para que proteção e diagnóstico não entrem em
deadlock operacional.

Um job autenticado remove periodicamente linhas cujo `expires_at` passou. O contador continua
correto sem o job, mas a limpeza impede acumulação permanente de chaves de IP/rota que não voltam.

A escolha não altera o contrato HTTP: exceder o limite responde `429` com
`code: 'RATE_LIMITED'` e `Retry-After`. O teste
`test/services/http/security.spec.ts` cobre limites, probes e falha do store. Proteção no Firewall
da Vercel pode ser adicionada como primeira camada, sem substituir a garantia compartilhada.

## Disponibilidade e fuso horário

### Onde mora cada peça

A janela de funcionamento fica em `room_schedules`, uma linha por sala e dia da semana,
com `opens_at`, `closes_at` e `slot_minutes`.
São horários de parede, sem fuso: o fuso é da empresa (`companies.timezone`) e só é
aplicado quando a janela é resolvida para um dia concreto.

**Sala sem linha em `room_schedules` para aquele dia é sala fechada, nunca sala aberta 24h.**
O motor devolve uma grade vazia, e o passo 2 do fluxo público mostra "sem horários".

O cálculo é o `CheckAvailabilityUseCase` (`src/services/bookings/application/`), e a
aritmética de fuso vive isolada em `src/services/bookings/domain/time-zone.ts`, escrita
sobre o `Intl` do runtime, sem biblioteca de data.

Para cada janela, o caso de uso busca em paralelo reservas ativas e `room_blocks` sobrepostos.
Holds expirados são cancelados de forma lazy antes da consulta; cada bloqueio marca os mesmos slots
como indisponíveis. A grade é informativa para a UX, enquanto constraints e triggers continuam
sendo a autoridade na escrita concorrente.

### A grade avança em tempo real, não em horário de parede

Cada slot dura exatamente `slot_minutes` de relógio absoluto, e o próximo começa quando o
anterior termina, até não caber mais um slot inteiro antes do fechamento.

Gerar as bordas em horário de parede (09:00, 10:00, 11:00...) e converter cada uma para
instante quebra nos dois dias de transição de horário de verão.
Quando o relógio adianta, o horário pulado não existe e vira um slot de duração zero.
Quando o relógio atrasa, a hora repetida gera dois slots com o mesmo rótulo, e uma conversão
que sempre escolhe a primeira ocorrência os faz apontar para o mesmo instante.

Avançando em tempo real, o dia da virada tem um slot a menos (ou a mais), todos com duração
real igual à cobrada, e nenhum instante coberto duas vezes.
Em `America/New_York`, no dia em que o relógio adianta, a grade vai de 01:00 direto para
03:00 sem buraco no tempo absoluto; no dia em que atrasa, 01:00 aparece duas vezes, com
offsets diferentes (`-04:00` e `-05:00`).
Coberto por teste em `test/services/bookings/check-availability.use-case.spec.ts` e ponta a
ponta em `test/services/bookings/availability.e2e-spec.ts`.

### Datas na fronteira da API

`startsAt`, `endsAt` e as bordas de disponibilidade cruzam a API em ISO 8601 **com offset
explícito**, no fuso da empresa (`2030-11-03T01:00:00-05:00`), e nunca em horário local solto.
O offset é o que distingue as duas ocorrências da hora repetida e o que permite ao cliente
exibir a grade no fuso da sala sem depender do fuso do navegador.
A resposta ainda carrega o `timezone` IANA, porque o offset sozinho não identifica o fuso.

A entrada é o oposto: `date=YYYY-MM-DD` é data de calendário pura, lida no fuso da empresa.
Data inexistente (`2026-02-30`) é recusada com 400 em vez de normalizada.

### Preço do slot

`priceInCents = floor((hourly_rate_in_cents * slot_minutes + 30) / 60)`.

Arredondamento meio para cima, em aritmética inteira, sem passar por ponto flutuante.
Meio para cima e não `floor` nem meio para par: é a regra que qualquer pessoa reproduz de
cabeça ao conferir a conta.

### Slots no passado

Slot que já começou não entra na grade, nem como indisponível.
O corte usa um `Clock` injetável (`src/services/bookings/domain/clock.ts`), não `new Date()`
solto: sem isso, o teste dessa regra dependeria da hora em que a suíte roda.

### Slug no fluxo público

`GET /api/v1/public/:companySlug/rooms/:roomId/availability` não tem sessão, então o tenant
vem do slug na URL, resolvido pelo `preHandler` único do plugin `/public/:companySlug`.
Ver a seção [API pública](#api-pública) para o mecanismo completo (`createResolveCompanySlug`,
`getPublicCompany`) e por que ele vale só dentro desse plugin.

Sala inativa ou de outra empresa responde o mesmo 404 de sala inexistente, sem revelar qual
dos três casos ocorreu.

## Reservas

### A invariante é do banco, e a aplicação só a traduz

`CreateBookingUseCase` **não** consulta a disponibilidade antes de gravar.
Consultar moveria a corrida para a janela entre o `SELECT` e o `INSERT`: duas requisições
simultâneas leriam a sala livre e as duas gravariam.

Sobreposição entre reservas é arbitrada por `bookings_no_overlap`; sobreposição com bloqueio é
arbitrada pelo trigger `enforce_room_occupancy`.
`DrizzleBookingRepository` captura o SQLSTATE `23P01` e o relança como
`BookingConflictError`, que a borda HTTP traduz em `409` com `code: 'BOOKING_CONFLICT'`.
A garantia é a mesma com uma requisição ou com cem, e é isso que o teste de concorrência de
`test/services/bookings/booking.e2e-spec.ts` prova: N requisições idênticas produzem
exatamente uma reserva, N-1 respostas 409 e nenhum 500.

Cancelar não apaga a linha: o `status` vai para `cancelled`, a reserva sai do índice parcial
da constraint e o horário volta para a grade, sem perder o histórico.

### O preço é sempre do servidor

`total_in_cents` é calculado a partir da tarifa da sala e da grade do dia, nunca do corpo da
requisição. `CreateBookingSchema` não tem campo de preço, e como `z.object` descarta chaves
desconhecidas, um `totalInCents` enviado pelo cliente é removido antes de chegar ao caso de uso.

O total é a **soma dos slots ocupados**, não o preço da duração inteira.
Com tarifa de 33 centavos por hora e grade de 30 minutos, dois slots custam 17 cada e somam 34,
enquanto cobrar a hora cheia daria 33.
Vale o que a grade mostrou ao cliente no passo 2.

### O período pedido precisa ser uma sequência de slots da grade

A janela vem de `room_schedules`, resolvida para o dia em que a reserva começa **no fuso da
empresa** - uma reserva das 21:00 de uma segunda em São Paulo já é terça em UTC, e ler o dia
da semana do instante bruto puxaria a agenda errada.

Três recusas distintas, todas com `422`:

| Situação | `code` |
| --- | --- |
| Sala fechada nesse dia, ou período fora de `[opensAt, closesAt)` | `OUTSIDE_BUSINESS_HOURS` |
| Início ou duração que não caem nas bordas da grade de `slot_minutes` | `SLOT_NOT_ALIGNED` |
| Horário que já começou, medido pelo `Clock` | `BOOKING_IN_THE_PAST` |

O alinhamento não é preciosismo: aceitar 09:15-10:15 numa grade de hora cheia bloquearia dois
slots ofertados e cobraria um.

### Sala inativa responde como sala inexistente

O domínio distingue `RoomNotFoundError` de `RoomNotAvailableError`, mas a borda pública
responde o mesmo `404 ROOM_NOT_FOUND`, com a mesma mensagem, nos dois casos.
É o mesmo critério já adotado na rota de disponibilidade: respostas diferentes transformariam
o endpoint em oráculo para descobrir salas de outras empresas.

## Agenda operacional

A agenda autenticada oferece os mesmos dados em três recortes: `from`/`to`, um dia de calendário
(`date`) ou uma semana (`weekStart`, obrigatoriamente segunda-feira). Data e horário de parede são
sempre interpretados no fuso IANA da empresa; a SPA nunca converte usando o fuso do computador do
operador.

`POST /api/v1/bookings` cria walk-in/reserva manual pelo mesmo `CreateBookingUseCase` do fluxo
público. Janela, alinhamento, preço, limite do plano e concorrência continuam iguais, mas a reserva
é confirmada imediatamente, sem hold nem Checkout. A criação gera auditoria com ator autenticado.

`PATCH /api/v1/bookings/:id/reschedule` preserva sala, duração e valor. Somente uma reserva
confirmada e sem check-in pode ser movida; o período novo volta a passar pela agenda da sala e pelas
invariantes de ocupação. A SPA pede confirmação antes do drag/drop e, em um `409`, restaura a posição
anterior e atualiza a agenda.

O estado operacional fica na própria reserva:

| Ação | Regra persistida |
| --- | --- |
| `POST .../:id/check-in` | exige `confirmed`; fora de `[startsAt, endsAt]` retorna `CHECK_IN_OUTSIDE_WINDOW_CONFIRMATION_REQUIRED` até `confirmOutsideWindow=true` |
| `POST .../:id/check-out` | exige check-in, grava `checked_out_at` e muda para `completed` |
| `POST .../:id/no-show` | exige reserva confirmada, sem check-in e já iniciada; muda para `no_show` |

`checked_in_at` e `checked_out_at` são fatos duráveis, não estado de componente ou memória da
Function. Operações repetidas que já alcançaram o mesmo estado são no-op quando seguro; transições
incompatíveis respondem `409 INVALID_BOOKING_TRANSITION`. Toda operação registra auditoria.

## Bloqueios de sala

`room_blocks` representa manutenção, evento interno ou qualquer indisponibilidade administrativa.
Owner e manager criam/removem; staff apenas lê. A SPA oferece uma tela por sala e diferencia
visualmente bloqueios de reservas.

| Endpoint | Semântica |
| --- | --- |
| `GET /api/v1/room-blocks?from=&to=&roomId=` | lista somente o tenant autenticado, com offsets no fuso da empresa |
| `POST /api/v1/room-blocks` | cria ocorrência ou série diária/semanal |
| `DELETE /api/v1/room-blocks/:id?scope=occurrence\|series` | remove só a ocorrência ou todas do grupo |

A recorrência é materializada deterministicamente em linhas individuais, limitada a 366 dias.
Isso mantém disponibilidade e constraints simples, dá ids a cada ocorrência e permite excluir uma
ocorrência sem interpretar regra recorrente durante cada request Serverless.

Cada bloqueio tem `period` `tstzrange` semiaberto e `room_blocks_no_overlap`. Para resolver a
corrida entre tabelas, `enforce_room_occupancy` adquire `FOR UPDATE` na linha da sala antes de
verificar a outra população. Reserva e bloqueio concorrentes da mesma sala ficam serializados:
somente um vence, independentemente de quantas Functions estejam ativas.

Ao criar uma série, o repositório abre uma transação, trava a sala, calcula todos os conflitos e
insere todas as ocorrências atomicamente. Reserva ativa conflitante responde
`409 ROOM_BLOCK_BOOKING_CONFLICT` com a lista sanitizada de ids/períodos/status; outro bloqueio
responde `409 ROOM_BLOCK_CONFLICT`. A série nunca fica parcialmente gravada.

## Pagamentos e assinaturas

A reserva pública nasce `pending` com um hold persistido de 31 minutos. O backend calcula o total,
cria o Checkout e anexa seu id condicionalmente; falha em qualquer passo compensa cancelando o
hold. Total zero não abre o Stripe e confirma a reserva atomicamente. A tela de retorno nunca
confia no `session_id` como prova de pagamento: consulta uma view pública sem PII e espera a
transição persistida.

`POST /api/v1/webhooks/stripe` recebe o corpo bruto e verifica a assinatura antes de interpretar o
evento. `stripe_events` é o ledger de idempotência. Ledger e transição da reserva/assinatura são a
mesma transação; confirmação exige reserva ainda `pending`, hold vigente, `payment_status=paid`,
moeda, valor e Checkout esperados. Eventos de pagamento assíncrono e entrega fora de ordem têm
tratamento explícito. Nenhum trabalho continua depois da resposta do webhook.

Planos `free`, `starter` e `pro` têm limites versionados. Ausência de assinatura significa plano
gratuito, sem criar linha no cadastro. Uso e limites são sempre verificados no servidor; exceder
responde `402 PLAN_LIMIT_EXCEEDED`. Assinaturas `past_due` ou `unpaid` colocam o tenant em
`read_only`, e somente `owner` lê/administra cobrança.

Expiração de holds e processamento do outbox são endpoints de job idempotentes sob
`/api/v1/jobs/*`, autenticados por `Authorization: Bearer CRON_SECRET` com comparação em tempo
constante. Supabase Cron ou scheduler equivalente os chama; a Function não mantém loop residente.

## E-mails transacionais

Uma trigger de outbox grava, na mesma transação da mudança de status, eventos de confirmação,
aviso à empresa, cancelamento e lembrete. A trigger não envia e-mail. `email_outbox` guarda
deduplicação, disponibilidade, lease, número de tentativas, próximo retry, erro, id do provedor e
data de entrega. O job adquire lotes com `FOR UPDATE SKIP LOCKED`, recupera leases abandonados e
aplica backoff exponencial até o estado terminal. Assim, indisponibilidade do Resend nunca desfaz
uma reserva já confirmada.

`EmailSender` é a porta do domínio; Resend é apenas um adapter. Sob `NODE_ENV=test` o factory
sempre escolhe um sender sem rede, mesmo que credenciais estejam presentes. Templates em português
levam somente nome, e-mail, sala, empresa, período e total necessários; telefone, observações,
credenciais e payloads Stripe não entram na mensagem.

O link de cancelamento contém só ids opacos e expiração, autenticados por HMAC-SHA-256. Ele vai no
fragmento `#token=` para não chegar em logs ou `Referer`, é removido da barra assim que a SPA o lê
e só cancela após confirmação explícita via `POST /api/v1/public/bookings/cancel`. A expiração é o
início da reserva; token expirado responde `410 CANCELLATION_LINK_EXPIRED` e não consulta nem
altera a linha.

Convites de equipe usam o mesmo outbox genérico, com dedupe pelo id do convite. O callback do
Better Auth aguarda apenas o enqueue durável; nunca chama o provedor dentro da request.

## Relatórios

`GET /api/v1/reports` e `GET /api/v1/reports.csv` exigem `report:read` e derivam `companyId` da
sessão. O período de calendário é interpretado no fuso do tenant e limitado a 366 dias. Uma única
consulta agregada no Postgres calcula ocupação geral/por sala/por dia, receita por sala, ticket
médio, cancelamentos e horário de pico. `generate_series` materializa só os dias pedidos, enquanto
reservas continuam filtradas pelos índices compostos de tenant, status e período.

Receita considera somente reservas com `stripe_payment_intent_id`, a evidência persistida de
pagamento; uma reserva manual confirmada não vira receita por inferência. Canceladas que chegaram a
ser confirmadas permanecem no denominador histórico. Capacidade usa a agenda real de cada dia no
fuso da empresa, inclusive transições de DST. O CSV usa o mesmo caso de uso, período e autorização
do JSON, com BOM UTF-8, separador ponto-e-vírgula e escaping de células.

## Hardening e observabilidade

As proteções HTTP são registradas no contexto raiz antes das rotas:

- Helmet aplica CSP restritiva à API, `frame-ancestors 'none'`, referrer policy e HSTS em produção;
- CORS permite `APP_URL` e somente as origens adicionais de `CORS_ALLOWED_ORIGINS`, sempre com
  validação de origem e credenciais explícitas;
- Better Auth usa cookies seguros em produção, e respostas autenticadas recebem
  `Cache-Control: private, no-store` e `Vary: Cookie`;
- `trustProxy` é habilitado somente em produção para interpretar corretamente o proxy da Vercel;
- cada request recebe UUID em `X-Request-ID`; o mesmo id aparece em resposta, erro e log;
- Pino registra método, rota, status, duração, user/tenant quando autenticado e aplica redaction a
  Authorization, cookies, senhas, tokens, chaves e assinatura Stripe;
- erro inesperado nunca devolve SQL, stack, host do banco ou segredo ao cliente.

O teto global usa `GLOBAL_RATE_LIMIT_MAX`/`GLOBAL_RATE_LIMIT_WINDOW_MS`. O wizard mantém namespaces
e tetos próprios. Todos incrementam `api_rate_limits` atomicamente por escopo e hash SHA-256 da
chave; falha do Postgres é fail-closed. `/api/health` e `/api/ready` ficam fora do contador para que
um incidente de proteção não esconda os probes. Firewall/WAF da Vercel pode ser uma primeira camada,
mas não substitui a garantia distribuída da aplicação.

Logs estruturados são adequados ao coletor da Vercel e correlacionáveis por `requestId`. Os alertas
operacionais mínimos são: taxa de 5xx/429, readiness 503, latência cold/warm, latência/conexões do
Supabase, falhas e duplicatas do Stripe, atraso dos holds e backlog/retries/dead letters do outbox.
Uptime de um isolate não é métrica de disponibilidade.

## Jobs externos

A aplicação expõe três unidades idempotentes de trabalho:

| Endpoint | Frequência operacional | Resultado |
| --- | --- | --- |
| `POST /api/v1/jobs/expire-pending-bookings` | ao menos uma vez por minuto | cancela holds vencidos e devolve `expired` |
| `POST /api/v1/jobs/process-email-outbox` | ao menos uma vez por minuto | devolve contadores `claimed`, `delivered`, `retried`, `dead` e `skipped` |
| `POST /api/v1/jobs/cleanup-rate-limits` | a cada 5 minutos | remove até 10.000 expirados e devolve `deleted` |

Supabase Cron ou outro scheduler HTTP envia `Authorization: Bearer <CRON_SECRET>`. A comparação do
secret é feita em tempo constante; configuração ausente responde 503 e credencial inválida, 401.
Retries do scheduler são permitidos: a expiração atualiza somente linhas ainda vencidas, e o outbox
usa dedupe, lease recuperável e `FOR UPDATE SKIP LOCKED` para distribuir lotes concorrentes.

A limpeza de rate limits usa somente estado persistido e é segura sob repetição ou concorrência;
lotes paralelos usam `FOR UPDATE SKIP LOCKED`. Sem ela, chaves que recebem tráfego uma única vez
permaneceriam na tabela depois de expiradas.

O lembrete de reserva é persistido desde a confirmação com `next_attempt_at = starts_at - 24h`.
Falhas recebem backoff exponencial, limitado, e após oito tentativas ficam `dead` para intervenção.
Não existe cron embutido na Function. O Vercel Cron do plano Hobby não atende a frequência dos holds
de 31 minutos, por isso o scheduler de referência é Supabase Cron ou equivalente.

## Configuração de produção

| Grupo | Variáveis | Regra |
| --- | --- | --- |
| runtime | `NODE_ENV`, `APP_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | Production usa HTTPS, mesma origem e secret exclusivo. |
| banco | `DATABASE_URL` | Supavisor Transaction pooler `:6543` com TLS; única conexão usada em requests. |
| administração | `DIRECT_DATABASE_URL` | Disponível somente ao processo de migration/CLI, não ao browser. |
| segurança | `CORS_ALLOWED_ORIGINS`, `GLOBAL_RATE_LIMIT_MAX`, `GLOBAL_RATE_LIMIT_WINDOW_MS`, `LOG_LEVEL` | Defaults seguros; origens extras somente quando necessárias. |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` | Valores e signing secret próprios por ambiente. |
| jobs | `CRON_SECRET` | Aleatório, mínimo de 32 caracteres e compartilhado só com o scheduler. |
| e-mail | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | From usa domínio verificado; `disabled` fica em desenvolvimento/teste. |
| cancelamento | `BOOKING_CANCELLATION_SECRET` | HMAC exclusivo; rotação invalida links ainda vigentes. |

Nenhuma variável server-side recebe prefixo `VITE_`. Preview não compartilha banco, Stripe, secrets
ou scheduler com Production. `PORT` é apenas local: a Vercel entrega objetos HTTP ao wrapper e a
aplicação não abre socket.

A ordem de promoção é: aplicar migrations com a URL direta, publicar a Function/SPA, registrar ou
validar webhook Stripe, ativar os três jobs, verificar health/readiness e executar smoke tests dos
fluxos críticos. Credenciais reais nunca entram em arquivo versionado.

## Erros HTTP

Rotas e hooks sinalizam falha **lançando** `HttpError`
(`src/services/http/http-error.ts`), traduzido para o formato `ApiError` por um
`setErrorHandler` global.

Isso não é preferência de estilo. Hooks precisam abortar o fluxo de forma explícita e portátil;
depender apenas de `reply.sent` ou de diferenças entre adaptadores HTTP pode deixar o handler da
rota executar depois de uma resposta antecipada, causando uma segunda escrita e
`ERR_HTTP_HEADERS_SENT`. Lançar `HttpError` mantém o mesmo comportamento no servidor local e no
runtime Bun da Vercel.

Regressão coberta em `test/services/http/pre-handler-abort.spec.ts`.

## Revisão concluída de issues e TODOs

As issues `#14`–`#21` e a consolidação `#22` estão refletidas nesta arquitetura. Critérios herdados
de processo contínuo foram substituídos por equivalentes Serverless:

- expiração de hold por timer virou expiração lazy + job externo idempotente;
- fila em memória virou `email_outbox` com lease/backoff/dead letter;
- rate limit por processo virou contador Postgres compartilhado com limpeza externa de expirados;
- Dockerfile, uptime e graceful shutdown de produção deram lugar a wrapper sem `listen()`, probes,
  headers, redaction, request correlation e métricas da plataforma; Docker permanece apenas sob o
  Supabase CLI no desenvolvimento local;
- lock local entre reservas/bloqueios virou transação, constraint e mutex por linha no Postgres.

A busca de 19 de agosto de 2026 não encontrou `TODO`, `FIXME`, `HACK` ou `XXX` no código. As
referências históricas a pagamentos como “MVP-08” e RBAC como “MVP-11” foram normalizadas para as
issues `#14` e `#16`.

## Referências de infraestrutura

- [Fastify na Vercel](https://vercel.com/docs/frameworks/backend/fastify)
- [Runtime Bun para Vercel Functions](https://vercel.com/docs/functions/runtimes/bun)
- [Ciclo de vida de Vercel Functions](https://vercel.com/docs/functions)
- [Conexões Postgres do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Drizzle com Supabase](https://orm.drizzle.team/docs/connect-supabase)
