-- "Deshacer" desde WhatsApp: recordamos la última captura por número.
--
-- Cuando el webhook crea una nota/cita/entidad/momento, guarda su kind+id en
-- la fila del vínculo. Si el usuario responde "deshacer", el webhook
-- soft-deletea esa última captura y limpia estos campos (naturalmente
-- idempotente: un segundo "deshacer" ya no encuentra nada).
--
-- Columnas nuevas sobre whatsapp_links (no se edita la migración previa ya
-- aplicada en el deploy preview; se agrega una nueva con ALTER, idempotente).

ALTER TABLE whatsapp_links
  ADD COLUMN IF NOT EXISTS last_capture_kind TEXT,
  ADD COLUMN IF NOT EXISTS last_capture_id UUID,
  ADD COLUMN IF NOT EXISTS last_capture_at TIMESTAMPTZ;
