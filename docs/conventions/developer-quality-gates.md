# Developer Quality Gates

Este contrato agrega dos herramientas de mantenimiento con alcance acotado:

- `npm run check:knip` o `npm run check:dead-code`: inventario de archivos, exports, scripts y dependencias que parecen no usados.
- `npm run check:architecture` o `npm run check:dependency-cruiser`: grafo de imports con dependency-cruiser para fronteras de arquitectura.
- `npm run report:quality-gates`: resumen auditable del baseline actual de Knip,
  dependency-cruiser y comandos disponibles.

El objetivo no es borrar codigo automaticamente. El objetivo es que la deuda nueva
sea visible y que las excepciones vivan documentadas cerca del check.

## Knip

Corre:

```bash
npm run check:knip
# alias compatible:
npm run check:dead-code
```

Knip parte desde entrypoints reales de Trama: Vite, tests, Playwright, Netlify
Functions, scripts operacionales y extension. Si reporta un falso positivo:

1. Confirma que el archivo/export/dependencia se usa en una frontera que Knip no
   puede ver, como Netlify runtime, assets publicos o tooling externo.
2. Prefiere agregar un entrypoint real en `knip.json`.
3. Si el uso es deliberadamente externo, agrega una excepcion pequeña en
   `ignoreFiles`, `ignoreDependencies`, `ignoreBinaries` o `ignoreIssues`.
4. Deja la excepcion lo mas especifica posible; no agregues carpetas completas
   salvo artefactos generados.

No uses `knip --fix` en este repo salvo para cambios revisados manualmente. No
uses `--allow-remove-files` en un PR de calidad gates.

### Baseline

`knip.json` contiene excepciones exactas para deuda historica detectada al
activar el gate: archivos sin uso confirmado, exports/tipos publicos que hoy no
tienen consumidor visible, binarios externos (`psql`) y dependencias usadas por
scripts operacionales (`pg`, `playwright`). Esas excepciones no significan que
la deuda este resuelta; significan que el check bloquea deuda nueva sin mezclar
este PR con una poda funcional.

El baseline actual queda ratcheado en `scripts/developer-quality-gates.test.mjs`:
como maximo 62 archivos con `ignoreIssues`, 70 tipos de issue ignorados, 5
`ignoreFiles`, 3 `ignoreDependencies` y 2 `ignoreBinaries`. Si una excepcion
nueva es inevitable, el mismo commit debe explicar por que no hay entrypoint real
mejor y actualizar el ratchet deliberadamente.

Para revisar el estado sin leer `knip.json` a mano, corre:

```bash
npm run report:quality-gates
```

Cuando limpies una entrada, elimina tambien su excepcion de `knip.json` en el
mismo commit.

## Dependency-Cruiser

Corre:

```bash
npm run check:architecture
# alias compatible:
npm run check:dependency-cruiser
```

Reglas activas:

| Regla                               | Protege                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `no-circular`                       | Evita ciclos nuevos en el grafo de imports versionado.                   |
| `no-client-to-netlify-functions`    | `src/` no puede importar handlers Netlify; debe usar `src/api` o `/api`. |
| `no-client-netlify-blobs`           | El cliente no puede importar `@netlify/blobs`.                           |
| `no-client-server-only-modules`     | Runtime browser no importa APIs Node ni paquetes server-only.            |
| `netlify-wrappers-delegate-to-lib`  | Wrappers `netlify/functions/*.mts` no importan otros wrappers.           |
| `no-lib-to-function-wrapper`        | `_lib` no depende de wrappers runtime con `config.path`.                 |
| `pdf-heavy-imports-through-loaders` | PDF pesado se mantiene detras de loaders, salvo tests/ensambladores.     |

Si una excepcion es legitima, agregala en `.dependency-cruiser.cjs` con
`pathNot` acotado y comentario. Si la excepcion empieza a crecer, probablemente
conviene crear un check especifico como los contratos existentes de PDF o
storage.

El baseline de ciclos debe tender a cero. Hoy
`.dependency-cruiser-known-violations.json` esta vacio: `check:architecture`
falla si aparece una violacion nueva o si alguien intenta mantener una entrada
obsoleta. Si en el futuro aparece una excepcion temporal, debe incluir una razon
especifica, un owner implicito por modulo y un plan de retiro; no uses el
baseline como estacionamiento permanente de ciclos.

## Integracion

Ambos checks viven en el job `lint` porque no requieren build ni base de datos.
Si una regla nueva produce demasiadas violaciones historicas, el PR debe:

1. documentar el baseline o allowlist;
2. bloquear deuda nueva cuando sea posible;
3. dejar la limpieza masiva para un PR dedicado.

## Paquete Local DB

Corre:

```bash
npm run db:up
npm run local:db-confidence
```

Runbook detallado: `docs/local-db-confidence.md`.

Este paquete no reemplaza a CI. Sirve para reproducir localmente los gates que
mas dependen de Postgres real y para evitar que cada PR backend/data tenga su
propia receta informal. Usa la DB migrada local por defecto
`postgresql://localhost:5433/trama`; si necesitas otra instancia, define
`DATABASE_URL`, `NETLIFY_DB_URL`, `QUERY_IT_DB_URL` o `BACKEND_DATA_IT_DB_URL`.
Los logs siempre redaccionan credenciales de la URL.

`check:query-plans` usa `DATABASE_URL`, luego `NETLIFY_DB_URL` y finalmente la
DB local por defecto. El catalogo debe mantener labels unicos, fixtures por
dominio y cobertura minima de `entities`, `quotes`, `recortes`, `momentos`,
`notes` y `search`; el test focalizado falla si se pierde uno de esos dominios.
Si falla con `relation ... does not exist`, la instancia existe pero no esta
migrada: corre `scripts/apply-migrations.sh` o `npm run db:reset`. Sus perillas
locales son `QUERY_PLAN_FIXTURE_SIZE`, `QUERY_PLAN_MAX_SEQ_SCAN_ROWS`,
`QUERY_PLAN_LIST=1` para inspeccionar labels sin DB y `QUERY_PLAN_ONLY=<label>`
para depurar un plan aislado.

`test:query-it:local` y `test:backend-data-it` crean roles temporales
no-superusuario para probar RLS real. Si tu URL migrada local no tiene permiso
`CREATE ROLE`, conserva `NETLIFY_DB_URL` para los gates runtime y pasa una URL
admin throwaway solo para integraciones:

```bash
LOCAL_DB_CONFIDENCE_ADMIN_DB_URL=postgresql://postgres@localhost:5433/trama \
npm run local:db-confidence
```

El runner ejecuta en orden:

| Gate                           | Que prueba                                                              |
| ------------------------------ | ----------------------------------------------------------------------- |
| `npm run check:cte-regression` | Semantica de CTEs sensibles contra una Postgres efimera aislada.        |
| `npm run check:query-plans`    | `EXPLAIN` JSON de listados calientes sobre la DB migrada.               |
| `npm run test:query-it:local`  | Integracion del motor de queries sin skips silenciosos por falta de DB. |
| `npm run test:backend-data-it` | Contratos endpoint->DB de entidades, citas, momentos y feed de notas.   |
| `npm run check:user-id-writes` | Writes privados con `user_id` explicito y warnings revisados.           |

`test:query-it:local` y `test:backend-data-it` son wrappers, no llamadas
directas a Vitest: ambos inyectan una URL local por defecto para que una DB
ausente falle en rojo en vez de convertir la suite en `skipped`.

Por seguridad, `check:cte-regression` no hereda la URL de la DB migrada local
desde `local:db-confidence`: usa su Postgres efimera por defecto. Solo define
`LOCAL_DB_CONFIDENCE_CTE_DATABASE_URL` si la URL apunta a una DB throwaway,
porque la regresion CTE crea y destruye fixtures propios.

Si `check:query-plans` falla por conexion, levanta la DB con `npm run db:up` y
vuelve a correr el paquete. Si falla por `Seq Scan`, revisa el plan antes de
agregar indices: un seq scan chico o catalogal puede ser correcto, pero los
feeds por `user_id` y busquedas calientes deben quedar cubiertos por indices o
por una allowlist pequena y justificada.
