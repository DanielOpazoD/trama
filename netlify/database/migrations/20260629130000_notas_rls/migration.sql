-- RLS en prompts, tasks, secrets, notas_attachments — Cimiento #1 (resto, mundo Notas).
--
-- Continúa el retrofit de RLS a las tablas core/dominio (ver 20260629120000_entities_user_rls
-- y siguientes). Estas son del mundo Notas, todas per-user con columna user_id; el contrato
-- auth-rls-contracts ya las declara rls:'required'. Mismo patrón y garantías que entities:
-- contexto por request (getAuthedUser → setCurrentRlsUser; getSql scopeado) + bypass de sistema.
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prompts_isolation ON prompts;
CREATE POLICY prompts_isolation ON prompts
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_isolation ON tasks;
CREATE POLICY tasks_isolation ON tasks
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE secrets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS secrets_isolation ON secrets;
CREATE POLICY secrets_isolation ON secrets
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE notas_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notas_attachments_isolation ON notas_attachments;
CREATE POLICY notas_attachments_isolation ON notas_attachments
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));
