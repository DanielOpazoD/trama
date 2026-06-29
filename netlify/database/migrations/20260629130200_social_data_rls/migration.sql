-- RLS en spotify_plays, x_bookmarks, x_cronicas — Cimiento #1 (resto, datos sociales).
--
-- Continúa el retrofit de RLS a las tablas de dominio. Son DATOS per-user de las
-- integraciones (reproducciones de Spotify, bookmarks y crónicas de X), todas con
-- columna user_id; el contrato auth-rls-contracts ya las declara rls:'required'.
-- NOTA: las tablas de CREDENCIALES (spotify_tokens, x_tokens) quedan fuera — son
-- singletons/estructura legacy con flujo OAuth por cookie; se tratan aparte.
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE spotify_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_plays FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spotify_plays_isolation ON spotify_plays;
CREATE POLICY spotify_plays_isolation ON spotify_plays
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE x_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_bookmarks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS x_bookmarks_isolation ON x_bookmarks;
CREATE POLICY x_bookmarks_isolation ON x_bookmarks
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE x_cronicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_cronicas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS x_cronicas_isolation ON x_cronicas;
CREATE POLICY x_cronicas_isolation ON x_cronicas
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));
