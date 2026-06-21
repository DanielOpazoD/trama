# Legacy Data Reassignment Dry Run v1

## Objetivo

Preparar el paso posterior a `Legacy Identity Cutover v1`: medir y simular la
reasignacion de datos historicos desde `legacy-single-user` hacia el `sub` real
de Clerk del dueno, sin mover filas ni blobs todavia.

Este PR no cambia la propiedad de datos. Su valor es convertir una migracion
riesgosa en una decision auditable: que tablas tienen filas legacy, que stores
de Netlify Blobs tienen keys sin prefijo de usuario, que seria automigrable y
que requiere revision manual.

## Principios

- Read-only por diseno: no `UPDATE`, no `DELETE`, no copy de blobs.
- Un solo inventario para DB y blobs, con salida JSON y Markdown.
- Contratos puros testeados para conteos, clasificacion y sanitizacion.
- Reusar `PRIVATE_TABLE_CONTRACTS` como fuente de verdad de tablas privadas.
- No inferir automaticamente el owner destino; se entrega por opcion/env.
- No mezclar con UI, nuevas features ni cambios de schema.

## Implementacion

### Script

Comando principal:

```bash
npm run legacy-data-reassignment:dry-run
```

Opciones:

```bash
npm run legacy-data-reassignment:dry-run -- --json
npm run legacy-data-reassignment:dry-run -- --markdown
npm run legacy-data-reassignment:dry-run -- --target-user-id=user_...
npm run legacy-data-reassignment:dry-run -- --no-db
npm run legacy-data-reassignment:dry-run -- --no-blobs
npm run legacy-data-reassignment:dry-run -- --sample-limit=3
npm run legacy-data-reassignment:dry-run -- --out-dir=artifacts/legacy-dry-run
```

Variables relevantes:

| Variable                             | Uso                                                   |
| ------------------------------------ | ----------------------------------------------------- |
| `DATABASE_URL` / `NETLIFY_DB_URL`    | Conexion a Postgres migrado para inventario SQL.      |
| `LEGACY_REASSIGNMENT_TARGET_USER_ID` | Owner real propuesto para el reporte, sin escribirlo. |

### Inventario SQL

El script recorre las tablas de `PRIVATE_TABLE_CONTRACTS` y ejecuta un conteo
por tabla:

```sql
SELECT COUNT(*)
FROM <tabla_privada>
WHERE user_id = 'legacy-single-user';
```

Los nombres de tabla pasan por `quoteIdentifier()` y solo aceptan
identificadores `snake_case`. Si una tabla falla, el script acumula un warning
y continua con el resto del inventario.

### Inventario Blobs

Stores cubiertos:

| Store               | Motivo                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `momentos-media`    | Videos, audios o imagenes historicas asociadas a Momentos.         |
| `recortes-media`    | Imagenes o derivados de Recortes.                                  |
| `notas-attachments` | Adjuntos de Notas, incluyendo metadata derivada del feed/busqueda. |

Regla de clasificacion:

| Key                      | Clasificacion     | Implicancia                                    |
| ------------------------ | ----------------- | ---------------------------------------------- |
| `user_123/path/file.png` | `scoped`          | Ya tiene owner explicito en la key.            |
| `file-legacy.png`        | `legacy-unscoped` | Requiere revision antes de copiar o renombrar. |

Los ejemplos de keys se sanitizan antes de imprimirse para evitar exponer
nombres completos de archivos privados.

## Matriz De Decision

| Recurso                     | Automigrable | Requiere revision | Riesgo rollback | Razon                                                                     |
| --------------------------- | ------------ | ----------------- | --------------- | ------------------------------------------------------------------------- |
| Tablas owner-scoped simples | Si           | No                | Low             | Solo cambia owner si el target fue aprobado.                              |
| `api_tokens`                | No           | Si                | High            | Material de autorizacion no debe moverse por lote sin decision explicita. |
| `notas_attachments`         | No           | Si                | High            | Metadata DB y blob key deben mantenerse consistentes.                     |
| `momentos*`                 | No           | Si                | Medium          | Incluye sharing, feedback, comentarios o media.                           |
| `recorte*`                  | No           | Si                | Medium          | Puede afectar feed, busqueda, citas y attachments relacionados.           |
| Blob key sin prefijo        | No           | Si                | High            | Requiere mapear referencia DB, destino y estrategia de rollback.          |

## Tests

Tests focalizados:

```bash
npx vitest run scripts/legacy-data-reassignment-dry-run.test.mjs
```

Cobertura esperada:

- Inventario SQL vacio.
- Tablas con filas legacy.
- Politicas de revision por tabla sensible.
- Blob keys prefijadas vs legacy sin prefijo.
- Ejemplos sanitizados.
- Reporte agregado en Markdown.
- Rechazo de identificadores SQL inseguros.

## Criterio De Exito

- El dry-run corre sin escribir en Postgres ni Netlify Blobs.
- El reporte deja claro que se moveria, que requiere revision y que riesgo de
  rollback tendria.
- El script queda en `package.json`, `scripts/README.md` y
  `scripts/script-registry.mjs`.
- El runbook multiusuario explica como usar el reporte antes de cualquier PR de
  migracion real.
- El PR siguiente puede decidir si conviene ejecutar una migracion por lotes o
  mantener compatibilidad historica indefinidamente.

## Checklist De Reviewer

Antes de aprobar este PR, revisar:

- El comando principal esta registrado en `package.json` y
  `scripts/script-registry.mjs`.
- Las tablas vienen desde `PRIVATE_TABLE_CONTRACTS`, no desde una lista paralela
  que pueda quedar stale.
- El inventario SQL solo usa `SELECT COUNT(*)` y nombres de tabla validados por
  `quoteIdentifier()`.
- El inventario de blobs solo llama `store.list()`; no hay `set`, `delete`,
  `copy`, `upload` ni rewrite de keys.
- El reporte marca como revision manual cualquier recurso con tokens, secrets,
  sharing, attachments o media.
- Los ejemplos de blob keys se sanitizan antes de aparecer en Markdown/JSON.
- El target owner aparece solo como dato de contexto; no se usa para escribir.
- `--out-dir` solo escribe artifacts locales Markdown/JSON; no escribe datos
  productivos.
- El runbook explica que el PR futuro de ejecucion debe tener smokes A/B,
  conteos antes/despues y rollback propio.

## No Objetivos

- No actualizar `user_id` en tablas productivas.
- No mover, copiar ni borrar blobs.
- No reescribir `storage_key`.
- No revocar ni cambiar usuarios Clerk.
- No eliminar `legacy-single-user`.
- No automatizar la eleccion del target owner.

## Siguiente PR Natural

`Legacy Data Reassignment Execution Preview v1`: generar un plan de cambios
idempotente por lote, todavia con modo `--dry-run` por defecto, que produzca
SQL transaccional y una lista de copy/delete de blobs sin ejecutarla. Ese PR
deberia exigir evidencia del dry-run actual y smokes multiusuario antes de
habilitar cualquier modo de escritura.
