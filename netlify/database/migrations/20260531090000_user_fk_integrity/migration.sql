-- Refuerzos de integridad multi-user sin modificar migraciones aplicadas.
--
-- - FKs user_id -> users(id) para tablas agregadas después de la migración
--   multi-user inicial.
-- - Soft-delete en momento_entities para que el borrado de una entidad no deje
--   links visibles en Momentos y pueda restaurarse con el mismo deleted_at.
-- - FK del puente notes.promoted_momento_id -> momentos(id).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cronicas_user_id_fk'
  ) THEN
    ALTER TABLE cronicas
      ADD CONSTRAINT cronicas_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atlas_snapshots_user_id_fk'
  ) THEN
    ALTER TABLE atlas_snapshots
      ADD CONSTRAINT atlas_snapshots_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_id_fk'
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_id_fk'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'x_tokens_user_id_fk'
  ) THEN
    ALTER TABLE x_tokens
      ADD CONSTRAINT x_tokens_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'x_bookmarks_user_id_fk'
  ) THEN
    ALTER TABLE x_bookmarks
      ADD CONSTRAINT x_bookmarks_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'x_cronicas_user_id_fk'
  ) THEN
    ALTER TABLE x_cronicas
      ADD CONSTRAINT x_cronicas_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_promoted_momento_id_fk'
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_promoted_momento_id_fk
      FOREIGN KEY (promoted_momento_id) REFERENCES momentos(id) NOT VALID;
  END IF;
END $$;

ALTER TABLE momento_entities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_momento_entities_user_live_momento
  ON momento_entities(user_id, momento_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_momento_entities_user_live_entity
  ON momento_entities(user_id, entity_id)
  WHERE deleted_at IS NULL;
