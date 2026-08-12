# meet-flow

SaaS de agendamento de salas para hotéis e coworkings.
A arquitetura e o roteiro completo estão em [`docs/plano.md`](docs/plano.md).

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

## Estrutura

```text
src/
  shared/     # Contratos Zod, enums e tipos compartilhados entre backend e frontend
  services/   # Módulos de backend (domain / application / infra por serviço)
  web/        # SPA React (adicionado a partir da etapa de frontend)
```
