-- Biblioteca: capa decoradora de metadatos propios de la Biblioteca.
--
-- La Biblioteca es un read-model que UNE las fuentes de archivos que ya existen
-- (notas_attachments, recorte_images, momentos foto, pdf_studio_saved_pdfs,
-- pdf_stamp_assets; y en el futuro storage_assets[library-uploads]). Esta tabla
-- NO duplica esos blobs: les añade metadata que solo le importa a la Biblioteca,
-- sin tocar las tablas de dominio:
--   - display_title: nombre editable (renombrar) — uniforme para todo `item_kind`.
--   - tags: etiquetas de Biblioteca.
--   - pinned: fijado.
--   - ai_status: estado de procesamiento IA (pending|processing|processed|failed).
--   - deleted_at: borrado suave A NIVEL BIBLIOTECA (oculta el item sin destruir el
--     blob ni la fila nativa; reversible). "Eliminados recientemente" lee esto.
--
-- Clave lógica del item: (item_kind, item_id). item_id es text para admitir UUID,
-- ids text (pdf_stamp_assets) y claves compuestas (foto N de un momento).
-- RLS por user_id, soft-delete (deleted_at) — nunca hard-delete.

CREATE TABLE IF NOT EXISTS library_item_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  item_id text NOT NULL,
  display_title text,
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  ai_status text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT library_item_overrides_kind_check
    CHECK (item_kind IN (
      'library-upload',
      'notas-attachment',
      'recorte-image',
      'momento-foto',
      'pdf-saved',
      'pdf-stamp'
    )),
  CONSTRAINT library_item_overrides_ai_status_check
    CHECK (ai_status IS NULL OR ai_status IN ('pending', 'processing', 'processed', 'failed')),
  CONSTRAINT library_item_overrides_display_title_check
    CHECK (display_title IS NULL OR char_length(display_title) BETWEEN 1 AND 400),
  CONSTRAINT library_item_overrides_item_id_check
    CHECK (char_length(item_id) BETWEEN 1 AND 300),
  CONSTRAINT library_item_overrides_user_item_uidx
    UNIQUE (user_id, item_kind, item_id)
);

-- Listar "eliminados recientemente" y soporte general del LEFT JOIN del read-model.
CREATE INDEX IF NOT EXISTS library_item_overrides_user_deleted_idx
  ON library_item_overrides (user_id, deleted_at);

ALTER TABLE library_item_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_item_overrides FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON library_item_overrides;
CREATE POLICY trama_user_isolation ON library_item_overrides
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
