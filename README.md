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
bun run test:e2e     # testes end-to-end (usa .env.test)
bun run db:generate  # gera uma migration a partir dos schemas Drizzle
bun run db:migrate   # aplica as migrations pendentes
bun run db:studio    # abre o Drizzle Studio
```

## Estrutura

```text
src/
  shared/     # Contratos Zod, enums e tipos compartilhados entre backend e frontend
  services/   # Módulos de backend (domain / application / infra por serviço)
  web/        # SPA React (adicionado a partir da etapa de frontend)
```
