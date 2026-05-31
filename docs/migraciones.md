# Migraciones SQL

## Cuándo abrir esto

- Vas a cambiar el schema (añadir columna, índice, tabla).
- Un deploy falló porque "una migración no aplicó".
- Recibiste un error en producción tipo "column X does not exist".
- Querés ver el estado actual del schema.

## La regla de oro

**Las migraciones aplicadas son INMUTABLES.** Una vez que `main` contiene una migración y se aplicó en producción, NUNCA editás ese archivo. Si necesitas cambiar algo, creás una migración nueva.

Si editás una migración aplicada, Netlify detecta que cambió el hash, **rechaza el deploy** y queda toda la app stuck.

## Verificación rápida

```bash
# Ver migraciones locales
ls netlify/database/migrations/

# Ver cuál se aplicó por última vez (mira el último timestamp)
ls -1 netlify/database/migrations/ | sort | tail -5
```

## Añadir una migración nueva

### Paso 1: crear el directorio

```bash
cd "/Users/daniel/Citas : Notas"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
mkdir netlify/database/migrations/${TIMESTAMP}_descripcion_corta
```

El nombre del directorio: `<timestamp 14 dígitos>_<slug>`. El timestamp es el orden de aplicación. El slug es descripción breve sin espacios.

### Paso 2: escribir el SQL

```bash
nvim netlify/database/migrations/${TIMESTAMP}_descripcion_corta/migration.sql
```

Estructura recomendada:

```sql
-- <Título>
--
-- <Por qué hace falta. Qué problema resuelve. Cualquier contexto que
-- el Daniel-de-dentro-de-6-meses necesitaría para entender este cambio.>

-- Cambios:
ALTER TABLE entities ADD COLUMN IF NOT EXISTS nueva_col TEXT;

-- Índice asociado (siempre con IF NOT EXISTS para idempotencia)
CREATE INDEX IF NOT EXISTS idx_entities_nueva_col
  ON entities (nueva_col) WHERE deleted_at IS NULL;
```

**Patrones**:

- Siempre `IF NOT EXISTS` en CREATE.
- Siempre `IF EXISTS` en DROP.
- `ADD COLUMN ... DEFAULT ...` para columnas NOT NULL (la migración popula filas existentes).
- Comentar el porqué arriba del archivo.

### Paso 3: probar localmente

La forma honesta de probar una migración es aplicarla sobre una DB limpia y
reaplicarla para confirmar idempotencia:

```bash
npm run db:reset
scripts/apply-migrations.sh
```

El primer comando levanta `trama-postgres` con Docker y aplica todo desde cero.
El segundo run debe terminar con `Applied 0 new migration(s).`

`scripts/apply-migrations.sh` usa `psql` del host si existe; si no, usa
`docker exec` contra el contenedor local `trama-postgres`. Si no tenés ni
`psql` ni Docker disponible, no hay forma local de probar SQL de verdad: dejá el
PR en draft hasta que el job `migrations` de CI esté verde.
Para apuntar a una base externa, seteá `NETLIFY_DB_URL`; `DATABASE_URL` queda
aceptado solo por compatibilidad y tiene prioridad si ambos existen.

### Paso 4: push

```bash
git add netlify/database/migrations/${TIMESTAMP}_*
git commit -m "Migración: <descripción>"
git push origin main
```

Netlify aplica la migración al deploy siguiente.

## Deploy falló por una migración

### Diagnóstico

1. Ir a https://app.netlify.com/sites/trama/deploys
2. Clic en el deploy fallido.
3. Ver el log. Buscar líneas con `migration` o `ERROR`.

Causas típicas:

- **Sintaxis SQL inválida**: el log dice qué línea.
- **Columna que se intenta crear ya existe**: olvidaste `IF NOT EXISTS`. Edita el archivo, push de nuevo.
- **Conflicto con datos existentes**: ej. añadiste un UNIQUE pero hay duplicados, o un NOT NULL pero hay NULLs. Hay que limpiar los datos primero o cambiar el constraint.

### Recuperación

Si la migración a medio aplicar dejó la DB en un estado raro:

1. Conectarse a Neon directamente: https://console.neon.tech/ → tu proyecto → SQL Editor.
2. Ver `_netlify_database_migrations` (la tabla que trackea qué se aplicó):
   ```sql
   SELECT * FROM _netlify_database_migrations ORDER BY applied_at DESC LIMIT 10;
   ```
3. Si la migración aparece pero no terminó:
   - Limpiar manualmente lo que sí se aplicó (ej. `ALTER TABLE entities DROP COLUMN nueva_col;`)
   - Borrar la entrada: `DELETE FROM _netlify_database_migrations WHERE filename = '<filename>';`
   - Push de nuevo y reintenta.

**Antes de tocar `_netlify_database_migrations`**, hacé export de la DB (ver [datos.md](datos.md)). Es la red de seguridad.

## Ver el estado actual del schema

En Neon Console → SQL Editor:

```sql
-- Todas las tablas
\dt

-- Columnas de entities (cambiá el nombre de la tabla según)
\d+ entities

-- Índices de una tabla
\di+ idx_entities*
```

O desde Mac:

```bash
# Si tenés psql instalado:
psql "$NETLIFY_DB_URL" -c "\dt"

# Si estás usando la DB local de Docker:
npm run db:psql
```

## Migraciones que NO podés hacer simplemente

- **Renombrar una columna** sin breaking changes en código viviendo en producción: hay que hacerlo en dos pasos (añadir nueva, código usa ambas, borrar vieja).
- **Cambiar el tipo de una columna en una tabla grande**: bloquea la tabla. Para tablas con >100k filas, hacerlo en horario de bajo uso o con técnica de "shadow column".
- **DROP de cualquier cosa importante**: pensálo dos veces. Mejor renombrar a `<col>_DEPRECATED_2026_XX` y borrar en una migración posterior cuando estés seguro.

## Contexto técnico

- El runner de migraciones es `@netlify/database`. Corre durante el build de Netlify, antes de subir el deploy.
- La tabla `_netlify_database_migrations` (en tu DB de Neon) registra qué migraciones se aplicaron, su hash y la fecha.
- Si el hash de un archivo cambia respecto a lo registrado, Netlify rechaza el deploy. Por eso las migraciones son inmutables tras aplicarse.
