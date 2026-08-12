#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
  echo "Nenhum .env encontrado, copiando de .env.example..."
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "Instalando dependências..."
bun install

echo "Subindo o Postgres via Docker..."
docker compose up -d postgres

bash scripts/wait-for-postgres.sh

if [ -d drizzle ] && [ -n "$(ls -A drizzle 2>/dev/null)" ]; then
  echo "Aplicando migrations..."
  bash scripts/migration-run.sh
else
  echo "Nenhuma migration encontrada ainda, pulando."
fi

echo "Iniciando a API em modo watch (http://localhost:${PORT:-3000})..."
exec bun --watch src/services/http/server.ts
