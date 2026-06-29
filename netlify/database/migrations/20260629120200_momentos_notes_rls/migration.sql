-- RLS en `momentos` y `notes` — Cimiento #1, bloque contenido.
--
-- Continúa el retrofit de RLS a las tablas core (ver 20260629120000_entities_user_rls).
-- momentos y notes guardan texto privado, fechas, media keys y notas escritas; el
-- contrato auth-rls-contracts ya las declara `rls: 'required'`. Mismo patrón y
-- garantías que entities (contexto por request + bypass de sistema).
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE momentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE momentos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS momentos_isolation ON momentos;
CREATE POLICY momentos_isolation ON momentos
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notes_isolation ON notes;
CREATE POLICY notes_isolation ON notes
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
