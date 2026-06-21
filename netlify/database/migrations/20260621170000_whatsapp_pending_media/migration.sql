CREATE TABLE IF NOT EXISTS whatsapp_pending_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  group_id UUID NOT NULL,
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  captured_at TIMESTAMPTZ,
  caption TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS whatsapp_pending_media_open_idx
  ON whatsapp_pending_media (user_id, phone_e164, created_at DESC)
  WHERE consumed_at IS NULL AND deleted_at IS NULL;

ALTER TABLE whatsapp_pending_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_pending_media FORCE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_pending_media_select_own
  ON whatsapp_pending_media
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY whatsapp_pending_media_insert_own
  ON whatsapp_pending_media
  FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY whatsapp_pending_media_update_own
  ON whatsapp_pending_media
  FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
