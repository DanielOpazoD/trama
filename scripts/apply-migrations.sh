#!/usr/bin/env bash
# Apply all migrations in netlify/database/migrations/ in lexicographic order
# to the local Postgres specified by DATABASE_URL.
#
# Usage:
#   DATABASE_URL=postgresql://trama:trama_local_dev@localhost:5433/trama \
#     scripts/apply-migrations.sh
#
# Requires: psql (brew install libpq, or part of postgres install).

set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://trama:trama_local_dev@localhost:5433/trama}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/netlify/database/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

# Track which migrations have been applied via a metadata table.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
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

  already_applied=$(psql "$DB_URL" -t -A -c "SELECT EXISTS(SELECT 1 FROM _migrations WHERE id = '$name')")
  if [ "$already_applied" = "t" ]; then
    echo "✓ already applied: $name"
    continue
  fi

  echo "→ applying: $name"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$sql_file"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "INSERT INTO _migrations (id) VALUES ('$name')"
  count=$((count + 1))
done

echo "Done. Applied $count new migration(s)."
