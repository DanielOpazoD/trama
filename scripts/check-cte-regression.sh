#!/usr/bin/env bash
#
# Ejecuta scripts/check-cte-regression.sql (regresión de los CTE atómicos de los
# handlers) contra Postgres real. Dos modos:
#   - DATABASE_URL seteado  → corre ahí (usado en CI sobre una DB throwaway).
#   - sin DATABASE_URL      → levanta un Postgres efímero local (initdb/pg_ctl).
#
# El SQL crea sus propias tablas throwaway, así que NO debe apuntarse a una DB
# con datos reales (las dropea). En CI se le pasa una DB recién creada.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL="$SCRIPT_DIR/check-cte-regression.sql"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "CTE regression → \$DATABASE_URL"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$SQL"
  echo "CTE regression OK"
  exit 0
fi

command -v initdb >/dev/null 2>&1 || {
  echo "initdb no disponible y \$DATABASE_URL no está seteado." >&2
  echo "Instalá postgres (brew install postgresql@16) o seteá DATABASE_URL." >&2
  exit 1
}

# macOS/Homebrew: sin LC_ALL=C el postmaster se vuelve multithreaded y no arranca.
export LC_ALL=C LANG=C
PORT="${CTE_PG_PORT:-5439}"
TMP="$(mktemp -d)"
cleanup() {
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --no-locale --encoding=UTF8 >/dev/null 2>&1
pg_ctl -D "$TMP/data" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$TMP" \
  -l "$TMP/log" -w -t 30 start >/dev/null 2>&1 || {
  echo "no se pudo arrancar el Postgres efímero:" >&2
  cat "$TMP/log" >&2
  exit 1
}
createdb -h 127.0.0.1 -p "$PORT" -U postgres ctetest
echo "CTE regression → Postgres efímero local (puerto $PORT)"
psql -h 127.0.0.1 -p "$PORT" -U postgres -d ctetest -v ON_ERROR_STOP=1 -q -f "$SQL"
echo "CTE regression OK"
