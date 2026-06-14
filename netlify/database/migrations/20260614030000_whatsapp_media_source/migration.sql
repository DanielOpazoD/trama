-- WhatsApp media + procedencia.
--
-- `source`: marca de qué medio entró la captura ('whatsapp'). Las tablas con
-- `origin` JSONB (entities, quotes, momentos) usan `origin.importedFrom` para
-- lo mismo; recortes y notes no tienen origin, así que llevan esta columna.
-- Habilita el iconito "vía WhatsApp" en la UI y un filtro por procedencia.
--
-- Aditiva (ADD COLUMN IF NOT EXISTS); no toca migraciones ya aplicadas.

ALTER TABLE recortes ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS source TEXT;
