# Arquitetura

Complemento do [`plano.md`](plano.md) com as decisões que já estão implementadas e que
outros módulos precisam respeitar.

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

Toda data que cruza a API é ISO 8601 **com offset explícito**, no fuso da empresa
(`2030-11-03T01:00:00-05:00`), e nunca em UTC nem em horário local solto.
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
vem do slug na URL.
Essa é a **única** exceção à regra de que `companyId` vem de `request.auth`, e ela vale só
aqui: o slug é resolvido para um `companyId` no banco, e daí em diante toda query filtra por
esse id.
Nenhuma rota autenticada aceita o tenant vindo do cliente.

Sala inativa ou de outra empresa responde o mesmo 404 de sala inexistente, sem revelar qual
dos três casos ocorreu.

## Reservas

### A invariante é do banco, e a aplicação só a traduz

`CreateBookingUseCase` **não** consulta a disponibilidade antes de gravar.
Consultar moveria a corrida para a janela entre o `SELECT` e o `INSERT`: duas requisições
simultâneas leriam a sala livre e as duas gravariam.

Quem arbitra é a constraint `bookings_no_overlap`.
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

## Erros HTTP

Rotas e hooks sinalizam falha **lançando** `HttpError`
(`src/services/http/http-error.ts`), traduzido para o formato `ApiError` por um
`setErrorHandler` global.

Isso não é preferência de estilo. No Bun, `reply.sent` continua `false` logo depois de
`reply.send()`, porque deriva de `raw.writableEnded`, e é esse sinal que o Fastify usa
para decidir se ainda executa o handler da rota. Um `preHandler` que responde 401 e
retorna `reply` responde certo **e mesmo assim executa o handler**, que tenta responder
de novo e derruba a requisição com `ERR_HTTP_HEADERS_SENT`. Sob Node o mesmo código se
comporta como a documentação do Fastify descreve, então o problema só aparece no runtime
de produção.

Regressão coberta em `test/services/http/pre-handler-abort.spec.ts`.
