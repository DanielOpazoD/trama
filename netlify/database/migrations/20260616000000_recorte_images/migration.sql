-- Recorte multi-imagen ("evento"): un recorte puede tener VARIAS imágenes.
--
-- Hasta ahora un recorte tenía una sola `image_key`. Cuando se mandan 2+ fotos
-- en un mismo mensaje de WhatsApp (default → Recortes), queremos que queden como
-- UN solo recorte-evento con varias imágenes, no N recortes sueltos (y que
-- "deshacer" borre el evento entero, no solo la última).
--
-- Coexistencia: los recortes de una sola imagen siguen usando `recortes.image_key`
-- (legacy + capturas web). Un recorte multi-imagen guarda TODAS sus imágenes acá
-- (la primera además queda en `image_key` como portada, para los lectores que
-- esperan una sola). El read-model expone `images[]` = filas de esta tabla si las
-- hay, o `[image_key]` si no.
--
-- Convenciones: RLS por dueño como el resto; los blobs viven en el store
-- `recortes-media` (mismo que `image_key`), así el endpoint que sirve imágenes no
-- cambia. No lleva `deleted_at`: las imágenes viven y mueren con su recorte
-- (`ON DELETE CASCADE` para el hard-delete; el soft-delete del recorte las oculta
-- vía el JOIN sobre recortes vivos). Nunca se hace `DELETE FROM` directo acá.

CREATE TABLE IF NOT EXISTS recorte_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorte_id UUID NOT NULL REFERENCES recortes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Blob authed en el store `recortes-media` (formato `${userId}/${hash}.${ext}`).
  storage_key TEXT NOT NULL,
  mime TEXT,
  -- Orden dentro del evento (0-based).
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recorte_images_recorte_idx
  ON recorte_images (recorte_id, position);

ALTER TABLE recorte_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorte_images FORCE ROW LEVEL SECURITY;

CREATE POLICY recorte_images_select_own
  ON recorte_images
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY recorte_images_insert_own
  ON recorte_images
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY recorte_images_update_own
  ON recorte_images
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY recorte_images_delete_own
  ON recorte_images
  FOR DELETE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
