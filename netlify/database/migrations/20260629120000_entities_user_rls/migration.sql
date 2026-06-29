-- RLS en `entities` — Cimiento #1: defensa en profundidad para las tablas core.
--
-- `entities` es una tabla CORE del esquema original (pre-multiusuario): nació sin
-- RLS porque el aislamiento dependía solo del filtro `user_id` en la aplicación.
-- Las features posteriores (recortes, momentos, biblioteca, whatsapp…) sí nacieron
-- con RLS, dejando una asimetría: las tablas con MÁS data privada tenían MENOS red.
-- El contrato `scripts/auth-rls-contracts.mjs` ya declara `rls: 'required'` para
-- `entities`; esta migración cierra ese gap con el mismo patrón que el resto.
--
-- No cambia el comportamiento observable: el contexto de usuario ya se establece
-- por request — `getAuthedUser()` llama `setCurrentRlsUser()` y `getSql()` devuelve
-- un cliente scopeado (AsyncLocalStorage) que setea `app.current_user_id` en cada
-- transacción. Los paths de sistema (crons, webhook pre-auth) usan
-- `runWithSystemRls` → `app.rls_bypass = 'system'`, que la policy contempla.
--
-- Migración inmutable (AGENTS.md): si hay que ajustar, crear una nueva.

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entities_isolation ON entities;
CREATE POLICY entities_isolation ON entities
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
