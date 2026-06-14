-- WhatsApp: vincular un número de teléfono a un usuario de Trama para
-- capturar notas, citas, entidades y momentos por mensaje.
--
-- Una fila representa o un CÓDIGO de vinculación pendiente (phone_e164 NULL,
-- link_code seteado, sin verificar) o un VÍNCULO confirmado (phone_e164
-- seteado, verified_at seteado, link_code limpiado). El código se genera
-- desde Configuración (sesión real autenticada) y se canjea enviando
-- "vincular <código>" por WhatsApp — así el dueño del número prueba que
-- controla la cuenta antes de que el webhook escriba en su nombre.
--
-- Soft-delete y RLS por usuario, como el resto. El webhook resuelve el
-- número con bypass de sistema (igual que resolvePersonalToken), porque
-- todavía no hay usuario en el contexto cuando llega el mensaje.

CREATE TABLE IF NOT EXISTS whatsapp_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- E164 (+56912345678). NULL mientras el código está pendiente de canje.
  phone_e164 TEXT CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- Código de un solo uso para canjear por WhatsApp. NULL una vez verificado.
  link_code TEXT,
  link_code_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Un número solo puede estar vinculado a UN usuario a la vez (entre vínculos
-- vivos y verificados). Los códigos pendientes (phone NULL) no compiten.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_links_phone_unique
  ON whatsapp_links (phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;

-- Canje rápido del código pendiente.
CREATE INDEX IF NOT EXISTS whatsapp_links_code_idx
  ON whatsapp_links (link_code)
  WHERE link_code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_links_user_idx
  ON whatsapp_links (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE whatsapp_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_links FORCE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_links_select_own
  ON whatsapp_links
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY whatsapp_links_insert_own
  ON whatsapp_links
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY whatsapp_links_update_own
  ON whatsapp_links
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
