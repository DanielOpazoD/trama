-- Read-model `objects`: proyección común del feed unificado de Notas.
--
-- La sección "notas" del mundo Notas muestra DOS clases de objeto juntas —
-- notas escritas y recortes (capturas) — ordenadas por fecha y filtrables.
-- Hasta ahora ese merge/orden/filtro vivía client-side (buildNotasFeed). Esta
-- migración lo mueve a SQL detrás de una VISTA, para poder paginar por keyset
-- y virtualizar la lista sin traer todo el feed al cliente.
--
-- Por qué una VIEW (no una tabla materializada ni una tabla espejo):
--   - Siempre fresca: lee las tablas base en vivo, sin job de sincronización
--     ni triggers que puedan desincronizarse de notes/recortes.
--   - El feed no es un hot path de millones de filas (notas + recortes de UN
--     usuario); el costo del UNION ALL + filtro keyset es despreciable con los
--     índices parciales que ya existen sobre (user_id, created_at).
--
-- Soft-delete: el `WHERE deleted_at IS NULL` está BAKEADO en la vista para
-- AMBAS tablas base, así ningún consumidor puede olvidarlo (AGENTS.md).
--
-- RLS: la vista NO es SECURITY DEFINER ni BARRIER especial; hereda las
-- políticas RLS de las tablas base (notes/recortes ya tienen RLS por user_id).
-- Igual el endpoint filtra explícito por user_id, como el resto del código.
--
-- Forma común (discriminada por `kind`):
--   id          uuid        — PK de la fila base
--   kind        text        — 'note' | 'recorte' (extensible a quote/entity/…)
--   created_at  timestamptz — fecha de creación (clave de orden)
--   occurred_at timestamptz — hoy = created_at; columna separada para que una
--                             fase futura ordene por "cuándo pasó" sin tocar
--                             los consumidores.
--   user_id     text        — dueño (scope del endpoint)
--   title       text        — note.title / recorte.source_title (puede ser NULL)
--   body        text        — note.content / recorte.text (para búsqueda lexical)
--   tags        text[]      — note.tags; '{}' para recortes (aún sin tags)
--   status      text        — NULL para notas; recorte.status para recortes
--                             (triage: 'pending' | 'promoted' | 'archived')
--
-- Keyset: el orden canónico es (created_at DESC, id DESC). Es estable porque
-- `id` (uuid) es único; ante empate de created_at el id desempata de forma
-- determinística. El endpoint pagina con `(created_at, id) < (cursor.ts, cursor.id)`.
--
-- Extensibilidad: para sumar otra clase (quotes/entities/momentos) se agrega
-- otro SELECT al UNION ALL en una migración nueva (las vistas se reemplazan con
-- CREATE OR REPLACE VIEW; no se "editan" filas) — los consumidores que pidan
-- esos kinds empiezan a verlos sin cambiar la forma de la vista.

CREATE OR REPLACE VIEW objects AS
  SELECT
    n.id,
    'note'::text                AS kind,
    n.created_at,
    n.created_at                AS occurred_at,
    n.user_id,
    n.title,
    n.content                   AS body,
    n.tags,
    NULL::text                  AS status
  FROM notes n
  WHERE n.deleted_at IS NULL

  UNION ALL

  SELECT
    r.id,
    'recorte'::text             AS kind,
    r.created_at,
    r.created_at                AS occurred_at,
    r.user_id,
    r.source_title              AS title,
    r.text                      AS body,
    '{}'::text[]                AS tags,
    r.status
  FROM recortes r
  WHERE r.deleted_at IS NULL;

-- Índices de apoyo al keyset/filtro, en las TABLAS BASE (una vista no puede
-- indexarse). Parciales sobre las filas vivas, igual que el resto.
--
-- notes ya tiene idx_notes_user_pinned_created (user_id, pinned, created_at) y
-- el GIN de tags. El keyset del feed NO ordena por `pinned` (el feed mixto es
-- estrictamente cronológico), así que ese índice no calza el ORDER BY
-- (created_at DESC, id DESC). Agregamos uno alineado al keyset.
CREATE INDEX IF NOT EXISTS idx_notes_user_created_id
  ON notes (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- recortes ya tiene recortes_user_status_idx (user_id, status, created_at). El
-- feed filtra por status PERO ordena por (created_at, id); este índice cubre el
-- keyset cuando el segmento incluye recortes sin filtro de estado.
CREATE INDEX IF NOT EXISTS idx_recortes_user_created_id
  ON recortes (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
