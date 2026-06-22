-- Biblioteca: vínculos (conexiones) de un item de Biblioteca con objetos de
-- dominio (entidad, nota, momento). Permite responder "¿dónde aparece este
-- archivo?" sin duplicar el blob ni tocar las tablas de origen.
--
-- Espeja el patrón de `momento_entities`: junction con `user_id`, soft-delete e
-- índices parciales. Como `item_id`/`target_id` son text heterogéneos (UUID, ids
-- text, claves compuestas) y no siempre hay FK al destino, NO usamos FK al
-- target: aislamos por `user_id` con RLS explícita (igual que
-- `library_item_overrides`).
--
-- Clave lógica: (user_id, item_kind, item_id, target_kind, target_id) única. El
-- alta es un upsert `ON CONFLICT ... DO UPDATE SET deleted_at = NULL` que revive
-- un vínculo borrado (mismo idioma que `momento_entities`).

CREATE TABLE IF NOT EXISTS library_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  item_id text NOT NULL,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz,
  CONSTRAINT library_item_links_item_kind_check
    CHECK (item_kind IN (
      'library-upload',
      'notas-attachment',
      'recorte-image',
      'momento-foto',
      'pdf-saved',
      'pdf-stamp'
    )),
  CONSTRAINT library_item_links_target_kind_check
    CHECK (target_kind IN ('entidad', 'nota', 'momento')),
  CONSTRAINT library_item_links_item_id_check
    CHECK (char_length(item_id) BETWEEN 1 AND 300),
  CONSTRAINT library_item_links_target_id_check
    CHECK (char_length(target_id) BETWEEN 1 AND 300),
  CONSTRAINT library_item_links_uidx
    UNIQUE (user_id, item_kind, item_id, target_kind, target_id)
);

-- Listar los vínculos de un item (panel "aparece en").
CREATE INDEX IF NOT EXISTS library_item_links_item_idx
  ON library_item_links (user_id, item_kind, item_id)
  WHERE deleted_at IS NULL;

-- Búsqueda inversa: qué archivos apuntan a un destino dado.
CREATE INDEX IF NOT EXISTS library_item_links_target_idx
  ON library_item_links (user_id, target_kind, target_id)
  WHERE deleted_at IS NULL;

ALTER TABLE library_item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_item_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON library_item_links;
CREATE POLICY trama_user_isolation ON library_item_links
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
