# Local DB Confidence

Este runbook documenta el paquete local para PRs backend/data. La intención es
reproducir en una sola receta los checks que dependen de Postgres real, RLS,
migraciones aplicadas y planes de query.

## Comando base

```bash
npm run db:up
npm run local:db-confidence
```

`npm run db:up` usa Docker y aplica migraciones con
`scripts/apply-migrations.sh`. En esta máquina también se puede correr contra
una Postgres throwaway de Homebrew si Docker no está disponible, pero esa ruta
manual exige que la instancia tenga `pgvector` instalado.

## Variables

| Variable                               | Uso                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `NETLIFY_DB_URL`                       | URL runtime/migrada para query plans y comandos de app.                |
| `DATABASE_URL`                         | Compatibilidad con scripts existentes; también apunta a DB migrada.    |
| `QUERY_IT_DB_URL`                      | URL explícita para `test:query-it:local`.                              |
| `BACKEND_DATA_IT_DB_URL`               | URL explícita para `test:backend-data-it`.                             |
| `QUERY_PLAN_FIXTURE_SIZE`              | Cantidad de fixtures por tabla para `check:query-plans`; default 1500. |
| `QUERY_PLAN_MAX_SEQ_SCAN_ROWS`         | Umbral de `Plan Rows` para bloquear seq scans grandes; default 100.    |
| `QUERY_PLAN_LIST`                      | `1` lista labels del catálogo sin abrir conexión a Postgres.           |
| `QUERY_PLAN_ONLY`                      | Corre solo uno o más labels del catálogo, separados por coma.          |
| `LOCAL_DB_CONFIDENCE_ADMIN_DB_URL`     | URL admin throwaway para integraciones que crean roles RLS.            |
| `LOCAL_DB_CONFIDENCE_CTE_DATABASE_URL` | Opt-in para correr CTE regression contra una DB throwaway propia.      |

Los logs redaccionan usuario y password antes de imprimir cualquier URL.

## Orden de gates

1. `npm run check:cte-regression`
   Prueba semántica SQL de CTEs sensibles. Por defecto levanta su propia
   Postgres efímera con `initdb/pg_ctl`, porque crea y destruye tablas de
   fixtures.

2. `npm run check:query-plans`
   Siembra fixtures declarados por dominio (`entities`, `quotes`, `recortes`,
   `momentos`, `notes`), setea `app.current_user_id` dentro de una transacción y
   ejecuta `EXPLAIN (FORMAT JSON)` sobre el catálogo de feeds y búsquedas
   calientes. Cubre listados paginados, feed unificado de Notas (`objects`) y
   búsqueda lexical representativa. La transacción termina con `ROLLBACK`, así
   que la corrida no deja fixtures nuevos en la DB local. Falla ante seq scans
   grandes no allowlisteados y termina con `query-plan OK: <n>/<n> checks`.

3. `npm run test:query-it:local`
   Wrapper anti-skip del motor de queries. Siempre inyecta una URL real para
   que la suite no pueda pasar como `skipped` por falta de `QUERY_IT_DB_URL`.

4. `npm run test:backend-data-it`
   Wrapper anti-skip de contratos endpoint -> DB para entidades, citas,
   momentos, búsqueda y notas. Usa Postgres real y roles no-superusuario para
   ejercitar RLS.

5. `npm run check:user-id-writes`
   Contrato estático de writes privados. `issues: 0` y `warnings: 0` significan
   que no quedan hallazgos sin resolver; los `acceptedWarnings` tienen razón
   explícita en el allowlist.

## URL admin opcional

Las suites `query-it` y `backend-data-it` crean roles temporales
no-superusuario para verificar RLS. Si tu URL migrada local no tiene permiso
`CREATE ROLE`, usa una URL admin solo para esas integraciones:

```bash
NETLIFY_DB_URL=postgresql://trama:trama_local_dev@localhost:5433/trama \
LOCAL_DB_CONFIDENCE_ADMIN_DB_URL=postgresql://postgres@localhost:5433/trama \
npm run local:db-confidence
```

No uses una base con datos reales para esta URL. Debe ser una DB local,
throwaway o de CI.

## Diagnóstico rápido

| Síntoma                                      | Acción                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ECONNREFUSED` en `check:query-plans`        | Levanta la DB migrada con `npm run db:up` o define `DATABASE_URL` / `NETLIFY_DB_URL`. |
| `relation ... does not exist` en query plans | Aplica `scripts/apply-migrations.sh` o recrea la DB con `npm run db:reset`.           |
| `permission denied to create role`           | Define `LOCAL_DB_CONFIDENCE_ADMIN_DB_URL` apuntando a una DB throwaway.               |
| `extension "vector" is not available`        | Usa la imagen `pgvector/pgvector:pg16` de Docker o instala pgvector local.            |
| `Seq Scan on <tabla>` con muchos plan rows   | Revisa índice por `user_id`/orden/búsqueda antes de allowlistear.                     |
| Tests aparecen como `skipped`                | Usa los wrappers `test:query-it:local` y `test:backend-data-it`, no Vitest directo.   |
| Warning nuevo en `check:user-id-writes`      | Simplifica el INSERT o agrega allowlist con razón de ownership autenticado.           |

## Qué no prueba

Este paquete no reemplaza:

- smokes productivos con Clerk/tokens reales;
- Playwright E2E visual;
- migraciones en Netlify;
- rendimiento a escala con millones de filas;
- correctness semántica de ranking IA/embeddings.

El siguiente PR lógico de deuda backend/data debería ir a contratos de endpoint
más profundos y validación runtime de rows críticos, no a sumar más wrappers.
