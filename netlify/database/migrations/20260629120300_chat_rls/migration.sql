-- RLS en `chat_threads` y `chat_messages` — Cimiento #1, bloque diálogo.
--
-- Continúa el retrofit de RLS a las tablas core (ver 20260629120000_entities_user_rls).
-- El chat guarda conversaciones privadas con la IA sobre el grafo del usuario; el
-- contrato auth-rls-contracts ya las declara `rls: 'required'`. Mismo patrón y
-- garantías que entities (contexto por request + bypass de sistema).
--
-- Migración inmutable (AGENTS.md).

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_threads_isolation ON chat_threads;
CREATE POLICY chat_threads_isolation ON chat_threads
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_isolation ON chat_messages;
CREATE POLICY chat_messages_isolation ON chat_messages
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
