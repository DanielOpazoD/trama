-- Adjuntos por SEMANA: las fotos pueden asociarse a una semana (Tareas), no
-- solo a notas o prompts.
--
-- La semana no es una entidad con uuid: se identifica por la fecha de su lunes
-- ('YYYY-MM-DD'). Por eso `owner_id` deja de ser uuid y pasa a text — los uuids
-- existentes de notas/prompts siguen siendo válidos como texto. Y el CHECK de
-- `owner_type` ahora admite 'week'.
--
-- Migración NUEVA (las aplicadas son inmutables).

ALTER TABLE notas_attachments
  ALTER COLUMN owner_id TYPE text USING owner_id::text;

ALTER TABLE notas_attachments
  DROP CONSTRAINT IF EXISTS notas_attachments_owner_type_check;

ALTER TABLE notas_attachments
  ADD CONSTRAINT notas_attachments_owner_type_check
  CHECK (owner_type IN ('note', 'prompt', 'week'));
