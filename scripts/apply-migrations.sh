#!/usr/bin/env bash
# Apply all migrations in netlify/database/migrations/ in lexicographic order
# to the local Postgres specified by NETLIFY_DB_URL or DATABASE_URL.
#
# Usage:
#   NETLIFY_DB_URL=postgresql://trama:trama_local_dev@localhost:5433/trama \
#     scripts/apply-migrations.sh
#   # DATABASE_URL is still accepted for compatibility and wins if both are set.
#
# Requires either:
#   - psql on the host (brew install libpq, or part of postgres install), or
#   - the local docker compose Postgres container `trama-postgres` running.

set -euo pipefail

DEFAULT_DB_URL="postgresql://trama:trama_local_dev@localhost:5433/trama"
DB_URL="${DATABASE_URL:-${NETLIFY_DB_URL:-$DEFAULT_DB_URL}}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/netlify/database/migrations"
PSQL_MODE=""

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  PSQL_MODE="host"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx 'trama-postgres'; then
  if [ "$DB_URL" != "$DEFAULT_DB_URL" ]; then
    echo "psql is not installed on the host, and DATABASE_URL/NETLIFY_DB_URL is custom." >&2
    echo "Install psql or unset DATABASE_URL/NETLIFY_DB_URL to use the local trama-postgres container." >&2
    exit 127
  fi
  PSQL_MODE="docker"
else
  echo "psql is not installed and local container trama-postgres is not running." >&2
  echo "Run npm run db:up with Docker available, or install psql (brew install libpq)." >&2
  exit 127
fi

psql_cmd() {
  if [ "$PSQL_MODE" = "host" ]; then
    psql "$DB_URL" "$@"
  else
    docker exec -i trama-postgres psql -U trama -d trama "$@"
  fi
}

# Track which migrations have been applied via a metadata table.
psql_cmd -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

count=0
for dir in "$MIGRATIONS_DIR"/*/; do
  name="$(basename "$dir")"
  sql_file="$dir/migration.sql"
  if [ ! -f "$sql_file" ]; then
    continue
  fi

  already_applied=$(psql_cmd -t -A -c "SELECT EXISTS(SELECT 1 FROM _migrations WHERE id = '$name')")
  if [ "$already_applied" = "t" ]; then
    echo "✓ already applied: $name"
    continue
  fi

  echo "→ applying: $name"
  if [ "$PSQL_MODE" = "host" ]; then
    psql_cmd -v ON_ERROR_STOP=1 -q -f "$sql_file"
  else
    psql_cmd -v ON_ERROR_STOP=1 -q < "$sql_file"
  fi
  psql_cmd -v ON_ERROR_STOP=1 -q -c "INSERT INTO _migrations (id) VALUES ('$name')"
  count=$((count + 1))
done

echo "Done. Applied $count new migration(s)."
