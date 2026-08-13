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
bun --watch src/services/http/server.ts &
API_PID=$!

# `vite` só herda o trap se ele existir antes de subir; sem isso, Ctrl+C mata só o
# processo em primeiro plano e deixa a API travando a porta na próxima execução.
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

echo "Iniciando o frontend (http://localhost:5173, proxy para a API em /api e /health)..."
# Sem `exec`: o trap de EXIT só roda se este shell continuar vivo até o `vite`
# terminar, seja por Ctrl+C ou por saída normal.
API_URL="http://localhost:${PORT:-3000}" bunx vite --config vite.web.config.ts
