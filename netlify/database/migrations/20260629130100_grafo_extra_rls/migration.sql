-- RLS en momento_entities, atlas_snapshots, proactive_suggestions, cronicas
-- — Cimiento #1 (resto, grafo/momentos/IA).
--
-- Continúa el retrofit de RLS a las tablas core/dominio. Todas per-user con columna
-- user_id; el contrato auth-rls-contracts ya las declara rls:'required'. Mismo patrón
-- y garantías que entities (contexto por request + bypass de sistema).
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE momento_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE momento_entities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS momento_entities_isolation ON momento_entities;
CREATE POLICY momento_entities_isolation ON momento_entities
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE atlas_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_snapshots_isolation ON atlas_snapshots;
CREATE POLICY atlas_snapshots_isolation ON atlas_snapshots
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE proactive_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_suggestions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proactive_suggestions_isolation ON proactive_suggestions;
CREATE POLICY proactive_suggestions_isolation ON proactive_suggestions
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE cronicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cronicas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cronicas_isolation ON cronicas;
CREATE POLICY cronicas_isolation ON cronicas
  USING (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (current_setting('app.rls_bypass', true) = 'system' OR user_id = NULLIF(current_setting('app.current_user_id', true), ''));
