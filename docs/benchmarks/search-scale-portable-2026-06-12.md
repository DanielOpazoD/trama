# Benchmark de busqueda lexical portable - 2026-06-12

## Contexto

- Rama: `codex/ambitious-trama-hardening`
- Commit base: `aed05427 Add portable search benchmark mode`
- Comando: `npm run bench:search-scale:portable`
- Datos: `SEARCH_BENCHMARK_SIZES=10000,50000` (default)
- DB: Postgres temporal local, creado con `initdb`, sin Docker y sin migraciones de Trama
- Cliente/runtime: PostgreSQL 16.14 (Homebrew), Darwin arm64, Apple M4
- Schema: tablas temporales `entities` y `quotes` con `search_vector` e indices lexicales GIN/trigram equivalentes al camino `mode=lexical`
- Limpieza: `ROLLBACK`; no deja fixtures

Este benchmark mide solo la rama lexical de `/api/search`. No cubre pgvector,
RLS, latencia de red, Neon, datos reales ni rerank IA.

## Resultados

| Dataset sintetico         | Query entities | Query quotes | Observacion                                                                             |
| ------------------------- | -------------: | -----------: | --------------------------------------------------------------------------------------- |
| 10k entities + 10k quotes |      30.780 ms |     2.825 ms | `entities` hizo seq scan; el dataset aun es chico para que el planner prefiera indices. |
| 50k entities + 50k quotes |     194.806 ms |     3.482 ms | `entities` uso BitmapOr con GIN/trigram; `quotes` uso GIN lexical + lookup por PK.      |

## Lectura

- El camino lexical queda muy por debajo del SLO documentado para
  `GET /api/search` hybrid (`p95 < 1s`) en esta maquina.
- La rama de `quotes` escala mejor en este synthetic porque la condicion lexical
  es mas selectiva.
- La rama de `entities` queda dominada por trigram similarity sobre nombres; si
  en datos reales se acerca a 1s, el primer ajuste a mirar es el umbral/uso de
  trigram en queries largas o poco parecidas a nombres.

## Reproduccion

```bash
tmpdir=$(mktemp -d)
port=5545
initdb -D "$tmpdir/data"
pg_ctl -D "$tmpdir/data" -o "-p $port -k $tmpdir" -l "$tmpdir/postgres.log" start
DATABASE_URL="postgresql://localhost:$port/postgres?host=$tmpdir" \
  npm run bench:search-scale:portable
pg_ctl -D "$tmpdir/data" stop
rm -rf "$tmpdir"
```
