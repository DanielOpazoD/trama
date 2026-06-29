-- RLS en error_log, extraction_log, web_vitals_samples, ai_task_providers
-- — Cimiento #1 fase 2 (logs, telemetría y config IA). Cierra el backlog.
--
-- Las cuatro son per-user: user_id se añadió a los logs en la migración
-- multi-user 20260526; web_vitals_samples nace con user_id; ai_task_providers
-- tiene PK (user_id, task). En logs/telemetría user_id es NULLABLE: las filas
-- históricas anónimas quedan invisibles salvo bajo bypass de sistema — deseable,
-- no pertenecen a ningún usuario.
--
-- Auditado: ningún acceso queda fuera de contexto de usuario o de bypass.
--   - Writers de extraction_log (~14) corren en handlers autenticados;
--     persistError (error_log) usa el cliente scopeado dentro del contexto del
--     request o del cron (bypass); web_vitals solo persiste si hay usuario
--     autenticado; ai-settings escribe ai_task_providers con user_id.
--   - Los crons (cost-alert-check; x/spotify scheduled-sync, que resuelven la
--     config IA) ya envuelven sus queries en runWithSystemRls (bypass).
--   - health.mts es per-user (runWithUserRls + WHERE user_id), no agregado
--     global, así que RLS no le esconde filas propias.
-- El patrón estándar (mismo que entities) no rompe ningún path. Sin cambios de
-- código.
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS error_log_isolation ON error_log;
CREATE POLICY error_log_isolation ON error_log
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE extraction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extraction_log_isolation ON extraction_log;
CREATE POLICY extraction_log_isolation ON extraction_log
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE web_vitals_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_vitals_samples FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_vitals_samples_isolation ON web_vitals_samples;
CREATE POLICY web_vitals_samples_isolation ON web_vitals_samples
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE ai_task_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_task_providers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_task_providers_isolation ON ai_task_providers;
CREATE POLICY ai_task_providers_isolation ON ai_task_providers
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));
