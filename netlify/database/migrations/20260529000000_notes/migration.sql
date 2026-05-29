-- τ-worlds Fase 2: Trama Notas — apuntes rápidos (memos).
--
-- Notas cortas en markdown con #etiquetas, en una línea de tiempo. Mundo
-- independiente del mapa, pero con un puente futuro: `promoted_momento_id`
-- enlaza la nota al Momento que se creó al "promoverla" (Fase 4).
--
-- Convenciones del proyecto:
--   - user_id text con default legacy (igual que cronicas / resto multi-user).
--   - soft-delete (deleted_at); las queries filtran `deleted_at IS NULL`.
--   - tags como text[] derivado del contenido en el server (parseTags).

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  content text NOT NULL,
  -- Etiquetas (#tag) extraídas del contenido, en minúsculas y sin el '#'.
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  -- Puente a Momentos: id del Momento creado al promover esta nota (Fase 4).
  promoted_momento_id uuid NULL,
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL
);

-- Listado típico: las notas vivas del usuario, fijadas primero y luego por
-- fecha. Índice parcial sobre las no borradas.
CREATE INDEX IF NOT EXISTS idx_notes_user_pinned_created
  ON notes (user_id, pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- Filtro por etiqueta (tag = ANY(tags)).
CREATE INDEX IF NOT EXISTS idx_notes_tags
  ON notes USING GIN (tags)
  WHERE deleted_at IS NULL;
