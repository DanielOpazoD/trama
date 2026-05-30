-- Soft-delete para x_bookmarks: el usuario puede descartar bookmarks guardados
-- desde la vista Twitter. Antes la tabla era append-only; ahora se respeta el
-- patrón soft-delete del resto del proyecto.
--
-- Clave: storeBookmarks hace ON CONFLICT (user_id, tweet_id) DO NOTHING, así un
-- bookmark descartado conserva su deleted_at y NO reaparece al re-sincronizar.
ALTER TABLE x_bookmarks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- El índice de listado cubre el filtro deleted_at IS NULL (los vivos).
CREATE INDEX IF NOT EXISTS idx_x_bookmarks_user_live
  ON x_bookmarks (user_id, tweet_created_at DESC)
  WHERE deleted_at IS NULL;
