-- Imprenta: biblioteca privada de firmas y timbres.
--
-- La imagen se guarda como data URL en Postgres para v1. Son assets pequeños,
-- privados por user_id y con límite estricto desde endpoint + constraints.
-- IndexedDB queda como cache/fallback local; la DB es la fuente de verdad.

CREATE TABLE IF NOT EXISTS pdf_stamp_assets (
  id text NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  src text NOT NULL,
  mime_type text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  last_used_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL,
  PRIMARY KEY (user_id, id),
  CONSTRAINT pdf_stamp_assets_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT pdf_stamp_assets_kind_check
    CHECK (kind IN ('signature', 'stamp')),
  CONSTRAINT pdf_stamp_assets_mime_type_check
    CHECK (mime_type IN ('image/png', 'image/jpeg')),
  CONSTRAINT pdf_stamp_assets_dimensions_check
    CHECK (width > 0 AND height > 0 AND width <= 10000 AND height <= 10000),
  CONSTRAINT pdf_stamp_assets_byte_size_check
    CHECK (byte_size > 0 AND byte_size <= 750000),
  CONSTRAINT pdf_stamp_assets_src_mime_check
    CHECK (
      (mime_type = 'image/png' AND src LIKE 'data:image/png;%')
      OR
      (mime_type = 'image/jpeg' AND src LIKE 'data:image/jpeg;%')
    )
);

CREATE INDEX IF NOT EXISTS idx_pdf_stamp_assets_user_updated
  ON pdf_stamp_assets (user_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pdf_stamp_assets_user_last_used
  ON pdf_stamp_assets (user_id, last_used_at DESC, id DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE pdf_stamp_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_stamp_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON pdf_stamp_assets;
CREATE POLICY trama_user_isolation ON pdf_stamp_assets
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR
    user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR
    user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
