#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
  echo "Nenhum .env encontrado, copiando de .env.example..."
  (umask 077 && cp .env.example .env)
fi

chmod 600 .env
bun install --frozen-lockfile
source scripts/prepare-local-supabase.sh
bun run scripts/check-dev-database.ts
exec bun run src/services/http/local.ts
