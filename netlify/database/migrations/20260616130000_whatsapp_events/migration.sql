-- Observabilidad del módulo WhatsApp: una fila por resultado de procesamiento de
-- un mensaje entrante (captura ok/fallida, visión, transcripción, recall…).
--
-- Por qué: hoy los eventos `whatsapp_*` solo van a `logEvent` (stdout de Netlify,
-- no consultable). Para el panel de "capturas por ruta + tasa de fallas" hace
-- falta una tabla. El webhook la escribe best-effort (si falla, no rompe la
-- captura); el panel del usuario la lee bajo su RLS.
--
-- `event`: categoría ('capture' | 'media' | 'vision' | 'transcription' | 'recall').
-- `kind` : ruta/destino cuando aplica (note/recorte/momento/quote/entity/task).
-- `ok`   : si el resultado fue exitoso (false = falla → numerador de la tasa).
-- `detail`: razón corta de la falla (acotada), o null.

CREATE TABLE IF NOT EXISTS whatsapp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  kind TEXT,
  ok BOOLEAN NOT NULL DEFAULT true,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_events_user_time_idx
  ON whatsapp_events (user_id, created_at DESC);

ALTER TABLE whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_events FORCE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_events_select_own
  ON whatsapp_events
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY whatsapp_events_insert_own
  ON whatsapp_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY whatsapp_events_delete_own
  ON whatsapp_events
  FOR DELETE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
