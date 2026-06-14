-- Fase 4 del motor de queries: consultas guardadas (saved_queries).
--
-- Persiste un AST de query con nombre por usuario para reusar "vistas" (ej.
-- "Filósofos antes de 1900") y para alimentar los bloques embebibles que
-- renderizan resultados en vivo. `query` es el MISMO shape serializable que
-- produce /api/query y el traductor NL→AST (Fase 3) — no se reinterpreta.
--
-- Tabla propia, soft-delete y RLS por usuario, como el resto. Sin política de
-- DELETE: el borrado es siempre UPDATE SET deleted_at (AGENTS.md).

CREATE TABLE IF NOT EXISTS saved_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  query JSONB NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Hot path: listar las consultas vivas del usuario, fijadas primero.
CREATE INDEX IF NOT EXISTS saved_queries_user_idx
  ON saved_queries (user_id, pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE saved_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_queries FORCE ROW LEVEL SECURITY;

CREATE POLICY saved_queries_select_own
  ON saved_queries
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY saved_queries_insert_own
  ON saved_queries
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY saved_queries_update_own
  ON saved_queries
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
