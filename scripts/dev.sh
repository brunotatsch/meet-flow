#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
  echo "Nenhum .env encontrado, copiando de .env.example..."
  (umask 077 && cp .env.example .env)
fi

chmod 600 .env

echo "Instalando dependências..."
bun install --frozen-lockfile

DEV_DATABASE_MODE="$(bun -e 'console.log(Bun.env.DEV_DATABASE_MODE ?? "local")')"

case "$DEV_DATABASE_MODE" in
  local)
    # O arquivo é sourced para que DATABASE_URL e DIRECT_DATABASE_URL sejam
    # herdadas pelo preflight, Fastify e pelos processos Vite.
    source scripts/prepare-local-supabase.sh
    ;;
  remote)
    echo "Usando o projeto Supabase remoto configurado no .env (sem migration automática)."
    ;;
  *)
    echo "DEV_DATABASE_MODE deve ser 'local' ou 'remote'." >&2
    exit 1
    ;;
esac

echo "Validando configuração, conexão e migrations do Supabase..."
bun run scripts/check-dev-database.ts

DEV_PORT="$(bun -e 'console.log(Bun.env.PORT ?? "3000")')"

echo "Iniciando a API em modo watch (http://localhost:${DEV_PORT})..."
bun --watch src/services/http/local.ts &
API_PID=$!

# `vite` só herda o trap se ele existir antes de subir; sem isso, Ctrl+C mata só o
# processo em primeiro plano e deixa a API travando a porta na próxima execução.
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

echo "Iniciando o frontend (http://localhost:5173, proxy para a API em /api)..."
# Sem `exec`: o trap de EXIT só roda se este shell continuar vivo até o `vite`
# terminar, seja por Ctrl+C ou por saída normal.
API_URL="http://localhost:${DEV_PORT}" bunx vite --config vite.web.config.ts
