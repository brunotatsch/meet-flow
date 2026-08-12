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
