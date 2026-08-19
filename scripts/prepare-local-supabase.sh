#!/usr/bin/env bash
set -euo pipefail

if [ ! -f supabase/config.toml ]; then
  echo "Configuração local ausente: execute 'bunx supabase init'." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não foi encontrado. Instale/inicie um runtime Docker compatível com o Supabase CLI." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "O daemon do Docker não está disponível. Inicie o Docker e execute novamente." >&2
  exit 1
fi

export DEV_DATABASE_MODE="local"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export DIRECT_DATABASE_URL="$DATABASE_URL"

if bunx supabase status >/dev/null 2>&1; then
  echo "Supabase local já está ativo."
else
  echo "Iniciando a stack local do Supabase (o primeiro download pode demorar)..."
  bunx supabase start >/dev/null
  echo "Supabase local iniciado: API http://127.0.0.1:54321 | Studio http://127.0.0.1:54323"
fi

echo "Aplicando e verificando migrations Drizzle no Supabase local..."
bun run db:migrate
