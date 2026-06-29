-- RLS en spotify_tokens, x_tokens — Cimiento #1 fase 2 (credenciales OAuth).
--
-- Ambas son per-user: spotify_tokens.user_id es NOT NULL y PK desde la
-- migración multi-user 20260526; x_tokens.user_id es PK desde su creación.
-- Los consumidores de usuario corren en contexto (los OAuth callbacks setean
-- el contexto vía setCurrentRlsUser; sync.ts filtra por user_id) y los crons
-- spotify-scheduled-sync / x-scheduled-sync ya envuelven sus queries en
-- runWithSystemRls (bypass de sistema). Auditado: ningún acceso a estas tablas
-- corre fuera de contexto de usuario o de bypass, así que el patrón estándar
-- (mismo que entities y las 11 de dominio) no rompe ningún path.
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE spotify_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spotify_tokens_isolation ON spotify_tokens;
CREATE POLICY spotify_tokens_isolation ON spotify_tokens
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE x_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS x_tokens_isolation ON x_tokens;
CREATE POLICY x_tokens_isolation ON x_tokens
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));
