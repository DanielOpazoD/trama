-- Favoritos: páginas web marcadas como favoritas desde la extensión.
--
-- Entidad PROPIA, separada de recortes: un favorito no es material para
-- curar al grafo, es un marcador de página (URL + título + nota opcional)
-- para volver. Por eso tabla aparte, sin status ni promoción. Soft-delete
-- y RLS por usuario, como el resto.

CREATE TABLE IF NOT EXISTS favoritos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2000),
  title TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS favoritos_user_idx
  ON favoritos (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE favoritos FORCE ROW LEVEL SECURITY;

CREATE POLICY favoritos_select_own
  ON favoritos
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY favoritos_insert_own
  ON favoritos
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY favoritos_update_own
  ON favoritos
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
