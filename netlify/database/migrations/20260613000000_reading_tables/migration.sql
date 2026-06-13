-- Reading tables (mesas / proyectos editoriales): persistir la mesa de Flujo.
--
-- Hoy la mesa de Flujo vive solo en localStorage (efímera, por navegador).
-- Esta entidad la hace persistente: un proyecto editorial mínimo = título +
-- materiales elegidos (ids del inbox) + borrador en Markdown + estado. No es
-- material para el grafo; es la pieza editorial donde la captura aterriza.
-- Soft-delete, provenance (origin) y RLS por usuario, como el resto.

CREATE TABLE IF NOT EXISTS reading_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  material_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(material_ids) = 'array'),
  draft_markdown TEXT,
  status TEXT NOT NULL DEFAULT 'borrador',
  origin JSONB NOT NULL DEFAULT '{"kind": "manual"}'::jsonb CHECK (origin ? 'kind'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS reading_tables_user_idx
  ON reading_tables (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE reading_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_tables FORCE ROW LEVEL SECURITY;

CREATE POLICY reading_tables_select_own
  ON reading_tables
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY reading_tables_insert_own
  ON reading_tables
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY reading_tables_update_own
  ON reading_tables
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
