-- Recortes: bandeja de entrada de capturas web (extensión de Chrome).
-- Todo lo capturado aterriza acá como 'pending'; desde la app se promueve
-- a cita/entidad/momento (trazado en promoted_target/promoted_id) o se
-- archiva. Soft-delete y RLS por usuario, como el resto de las tablas.

CREATE TABLE IF NOT EXISTS recortes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(trim(text)) BETWEEN 1 AND 20000),
  source_url TEXT,
  source_title TEXT,
  source_author TEXT,
  note TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'promoted', 'archived')),
  promoted_target TEXT
    CHECK (promoted_target IN ('quote', 'entity', 'momento')),
  promoted_id UUID,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recortes_user_status_idx
  ON recortes (user_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE recortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recortes FORCE ROW LEVEL SECURITY;

CREATE POLICY recortes_select_own
  ON recortes
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY recortes_insert_own
  ON recortes
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY recortes_update_own
  ON recortes
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

-- Tokens personales (extensión de Chrome). Se guarda SOLO el hash sha256
-- del token; el valor en claro se muestra una única vez al generarlo.
-- La búsqueda por hash en el login del token corre con bypass 'system'
-- (todavía no hay usuario en contexto); el resto, RLS por dueño.

CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'extensión de Chrome',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx
  ON api_tokens (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY api_tokens_select_own
  ON api_tokens
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY api_tokens_insert_own
  ON api_tokens
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY api_tokens_update_own
  ON api_tokens
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
