-- Valida constraints creadas previamente con NOT VALID.
--
-- La migración 20260531090000 agregó FKs sin escanear filas existentes para
-- reducir riesgo operacional en deploy. En este punto el backfill/normalización
-- de user_id ya quedó cubierto por guardrails y endpoints multi-user, así que
-- cerramos la deuda validando las constraints en una migración nueva.

ALTER TABLE cronicas
  VALIDATE CONSTRAINT cronicas_user_id_fk;

ALTER TABLE atlas_snapshots
  VALIDATE CONSTRAINT atlas_snapshots_user_id_fk;

ALTER TABLE notes
  VALIDATE CONSTRAINT notes_user_id_fk;

ALTER TABLE tasks
  VALIDATE CONSTRAINT tasks_user_id_fk;

ALTER TABLE x_tokens
  VALIDATE CONSTRAINT x_tokens_user_id_fk;

ALTER TABLE x_bookmarks
  VALIDATE CONSTRAINT x_bookmarks_user_id_fk;

ALTER TABLE x_cronicas
  VALIDATE CONSTRAINT x_cronicas_user_id_fk;

ALTER TABLE notes
  VALIDATE CONSTRAINT notes_promoted_momento_id_fk;
