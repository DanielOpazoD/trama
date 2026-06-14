-- Idempotencia del webhook de WhatsApp.
--
-- Twilio reintenta el POST del webhook si no recibe un 200 a tiempo (~15s) o
-- ante un 5xx. Como la captura hace embeddings (red a OpenAI) y, en texto
-- libre, una llamada LLM ANTES de responder, un pico de latencia podía
-- disparar un reintento y crear la misma nota/cita dos veces — y pagar el LLM
-- dos veces. Este ledger guarda el `MessageSid` ya procesado; el webhook lo
-- "reclama" con INSERT ... ON CONFLICT DO NOTHING antes de procesar, y si el
-- SID ya estaba, corta sin re-escribir.
--
-- Append-only: no tiene `deleted_at` ni se borra nunca (es un registro de
-- hechos). RLS por usuario, igual que el resto.

CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
  message_sid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_processed_messages_user_idx
  ON whatsapp_processed_messages (user_id, created_at DESC);

ALTER TABLE whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_processed_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_processed_messages_select_own
  ON whatsapp_processed_messages
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY whatsapp_processed_messages_insert_own
  ON whatsapp_processed_messages
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
