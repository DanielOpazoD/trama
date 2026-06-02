# Datos: backup, export, import, restauración

## Cuándo abrir esto

- Quiero hacer una copia de seguridad ya, antes de un cambio grande.
- Necesito restaurar la trama a cómo estaba ayer/la semana pasada.
- Quiero mover la trama a otra instancia (otro proyecto Netlify, otra DB).
- Acabo de borrar algo importante y quiero recuperarlo.

## El ritual mensual

**1 vez al mes (mínimo)**:

1. Abrir Trama, ir a Settings.
2. Bajar a "Datos" → clic en **Exportar**.
3. Se descarga un archivo `trama-YYYY-MM-DD.json`.
4. Guardarlo en algún lugar fuera de la nube principal (un disco externo, Dropbox, Drive). No solo en iCloud — si pierdes la cuenta principal pierdes todo a la vez.
5. Ya está.

Cinco minutos al mes te garantizan que aunque Netlify y Neon desaparezcan mañana, tu trama de 5 años sigue siendo recuperable.

## Restaurar desde un export

### Si la DB sigue viva pero querés sobrescribir

1. Abrir Trama → Settings → Datos → **Importar**
2. Seleccionar el JSON.
3. La importación NO borra lo existente — añade. Si querés sobrescribir limpio, primero usa Neon Console para limpiar las tablas (cuidado), o crea un proyecto Netlify nuevo y restaura ahí.

### Si la DB se perdió completamente

1. Crear un proyecto Netlify nuevo desde el repo (https://app.netlify.com/start).
2. Configurar las env vars (ver [deploy.md](deploy.md)). Va a crear una DB nueva al primer deploy.
3. Esperar a que termine el primer deploy (incluye correr migraciones, ~2 min).
4. Abrir la nueva Trama, ir a Settings → Datos → Importar.
5. Subir el JSON.

## Backup de la DB (incluye lo que el JSON no puede llevar)

El export JSON actual es un **backup estructurado core parcial**. El archivo
declara `scope.kind = "structured-core"` y `scope.completeness = "partial"`
para que no se confunda con un dump completo de Neon/Blobs. En modo
multiusuario, exporta solo filas del usuario autenticado. Cubre:

- `entities`
- `relationships`
- `quotes`
- `momentos` + `momento_entities`
- `notes`
- `tasks`
- `prompts`
- `secrets` con `encryptedSecret` cifrado por el vault del cliente
- metadata de anexos de Notas/Prompts (`attachments`)
- referencias a blobs (`blobReferences`) para auditar qué media depende de Netlify Blobs

No incluye los bytes binarios de Netlify Blobs ni tablas operacionales/derivadas:

- archivos reales de fotos, screenshots, audios o anexos en Blobs
- claves en texto plano; el servidor solo exporta el sobre cifrado ya persistido
- `cronicas_snapshots`
- `atlas_snapshots`
- chat_threads + chat_messages
- spotify_plays
- spotify_tokens
- x_bookmarks + x_tokens
- proactive_suggestions
- extraction_log + error_log
- ai_task_providers
- llm_cache
- web_vitals_samples
- Embeddings (aunque se regeneran on-demand vía Settings → "Indexar lo pendiente")

Importar ese JSON restaura solo ese core estructurado. Restaura Prompts y Claves
si el archivo contiene sus filas; las Claves siguen requiriendo la misma
contraseña/key física del vault cliente para poder descifrarse. No restaura bytes
de blobs, tokens OAuth, logs ni snapshots derivados.

Para un backup TOTAL de la DB: usar Neon's built-in. Para un backup TOTAL que además
incluya media, hay que respaldar también Netlify Blobs.

### Neon backups automáticos

Neon hace snapshots automáticos (Point-in-Time Recovery). Para usarlos:

1. https://console.neon.tech → tu proyecto → Branches.
2. Botón `Restore`.
3. Elegir punto temporal (cualquier momento en los últimos 7 días en el plan free; más en planes pagos).
4. Crea una branch nueva con el estado de ese momento. Puedes:
   - Conectarte a ESA branch desde otro proyecto para inspeccionar.
   - Promoverla a `main` (sobrescribe la actual — destructivo).

### Manual: dump + restore con pg_dump

Si querés backups que vivan FUERA de Neon:

```bash
# Obtener la connection string
# Netlify → Site → Environment variables → NETLIFY_DB_URL → copy

# Dump completo a un archivo (PRECAUCIÓN: contiene secretos como spotify_tokens)
pg_dump $NETLIFY_DB_URL > trama-backup-$(date +%Y%m%d).sql

# Restaurar a otra DB
psql $NUEVA_DB_URL < trama-backup-20260522.sql
```

El archivo `.sql` puede ser de varios MB a varios GB según el tamaño de la trama. Comprimilo con `gzip` para ahorrar espacio.

**El archivo `.sql` contiene secretos** (`spotify_tokens` por ejemplo). Tratá ese archivo como contraseña: no lo subas a Drive público.

## Recuperar algo que borraste

Trama usa **soft delete**. Cuando borrás una entidad, una cita o una relación, no se borra de la DB — se le pone `deleted_at = NOW()`. La fila sigue ahí, oculta.

Para recuperar una fila:

1. https://console.neon.tech → tu proyecto → SQL Editor.
2. Buscar la fila:
   ```sql
   SELECT id, name, deleted_at
   FROM entities
   WHERE name ILIKE '%borges%' AND deleted_at IS NOT NULL;
   ```
3. Restaurar:
   ```sql
   UPDATE entities SET deleted_at = NULL WHERE id = '<uuid>';
   ```
4. Si era una entidad, sus quotes y relaciones también se soft-deletearon en cascada. Restaurarlas también:
   ```sql
   UPDATE quotes SET deleted_at = NULL WHERE entity_id = '<uuid>';
   UPDATE relationships SET deleted_at = NULL WHERE from_id = '<uuid>' OR to_id = '<uuid>';
   ```

**Limitación**: solo funciona mientras la fila siga existiendo. Algún día puede haber un compaction que borre filas soft-deleted muy antiguas — cuando exista, su runbook va a ser separado.

## Mover Trama a otro proyecto / cuenta

1. Export JSON desde la actual (Settings → Datos → Exportar).
2. Cancelar el proyecto actual en Netlify si querés (o dejarlo como respaldo).
3. Fork el repo a una cuenta nueva si vas a otra cuenta de Github.
4. Crear proyecto Netlify nuevo, configurar env vars, dejar que termine el primer deploy.
5. Importar el JSON en Settings.

## Contexto técnico

- El endpoint `/api/export` devuelve `version: 2` con scope `structured-core`: grafo, citas, Momentos, notas, tareas, Prompts, Claves cifradas y referencias/metadata de blobs.
- `/api/import` acepta `version: 1` legado y `version: 2`, e inserta vía `INSERT ... ON CONFLICT ... DO NOTHING`.
- Soft-delete vive en `deleted_at TIMESTAMPTZ NULL` en todas las tablas de dominio.
- Las tablas append-only (chat_messages, spotify_plays, error_log, extraction_log) no tienen soft-delete — se borran via CASCADE de su parent o nunca.
