-- Fix: la columna `label` que usan el GET y el POST de whatsapp-link nunca se
-- creó en la migración original (20260613230000_whatsapp_links). El endpoint
-- hace `SELECT ... label` e `INSERT INTO whatsapp_links (user_id, label, ...)`,
-- así que en producción fallaba con `column "label" does not exist` → HTTP 500
-- al generar el código de vinculación. Los tests de endpoint mockean el SQL y
-- no validan el esquema real, por eso no lo detectaron.
--
-- `label` es opcional (etiqueta para reconocer el dispositivo/número), nullable.

ALTER TABLE whatsapp_links ADD COLUMN IF NOT EXISTS label TEXT;
