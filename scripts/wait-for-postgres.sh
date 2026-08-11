#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

POSTGRES_USER="${POSTGRES_USER:-meetflow}"
POSTGRES_DB="${POSTGRES_DB:-meetflow}"
MAX_ATTEMPTS="${WAIT_FOR_POSTGRES_MAX_ATTEMPTS:-30}"

echo "Aguardando o Postgres ficar pronto..."

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    echo "Postgres pronto."
    exit 0
  fi

  echo "  tentativa $attempt/$MAX_ATTEMPTS..."
  sleep 1
done

echo "Postgres não ficou pronto a tempo." >&2
exit 1
