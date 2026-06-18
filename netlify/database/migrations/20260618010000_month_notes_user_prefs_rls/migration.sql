-- Hardening multiusuario: month_notes y user_prefs ya tenían user_id + FK,
-- pero faltaba forzar RLS como contrato de defensa en profundidad.

ALTER TABLE month_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON month_notes;
CREATE POLICY trama_user_isolation ON month_notes
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

ALTER TABLE user_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prefs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON user_prefs;
CREATE POLICY trama_user_isolation ON user_prefs
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
