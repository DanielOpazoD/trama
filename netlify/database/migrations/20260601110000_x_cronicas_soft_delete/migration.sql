-- Soft-delete para x_cronicas: permite "eliminar" la crónica de bookmarks
-- desde la UI (botón en la vista Twitter) sin romper el patrón de borrado
-- lógico del proyecto. getLatestXCronica filtra `deleted_at IS NULL`, así
-- que al borrar la sección queda vacía hasta que el usuario regenere.
ALTER TABLE x_cronicas
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_x_cronicas_user_live
  ON x_cronicas (user_id, generated_at DESC)
  WHERE deleted_at IS NULL;
