-- Adjuntos por TAREA: las fotos pueden asociarse a un recordatorio puntual,
-- además de a la semana. La tarea sí tiene uuid, así que `owner_id` guarda su
-- id directamente (owner_id ya es text desde 20260601140000).
--
-- Solo amplía el CHECK de owner_type para admitir 'task'. Migración NUEVA.

ALTER TABLE notas_attachments
  DROP CONSTRAINT IF EXISTS notas_attachments_owner_type_check;

ALTER TABLE notas_attachments
  ADD CONSTRAINT notas_attachments_owner_type_check
  CHECK (owner_type IN ('note', 'prompt', 'week', 'task'));
