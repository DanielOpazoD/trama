-- RLS en `quotes` y `relationships` — Cimiento #1, bloque grafo.
--
-- Continúa el retrofit de RLS a las tablas core (ver 20260629120000_entities_user_rls).
-- quotes y relationships son del esquema original (pre-multiusuario); el contrato
-- auth-rls-contracts ya las declara `rls: 'required'`. Mismo patrón y mismas
-- garantías que entities: el contexto de usuario ya se establece por request
-- (getAuthedUser → setCurrentRlsUser; getSql scopeado), y los paths de sistema
-- usan runWithSystemRls → app.rls_bypass='system'.
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotes_isolation ON quotes;
CREATE POLICY quotes_isolation ON quotes
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relationships_isolation ON relationships;
CREATE POLICY relationships_isolation ON relationships
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
