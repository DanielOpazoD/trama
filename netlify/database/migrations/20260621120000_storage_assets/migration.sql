-- Storage and Observability Boundary v1
--
-- Manifest relacional de archivos privados guardados en providers externos
-- (hoy Netlify Blobs). No mueve bytes ni cambia el provider: registra metadata
-- verificable por usuario/dominio para poder auditar ownership, detectar
-- huérfanos y preparar una futura migración de storage con checksum.

CREATE TABLE IF NOT EXISTS storage_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  provider text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz,
  CONSTRAINT storage_assets_domain_check
    CHECK (
      domain IN (
        'notas-attachments',
        'momentos-media',
        'recortes-media',
        'pdf-studio-saved-pdfs',
        'pdf-stamp-assets'
      )
    ),
  CONSTRAINT storage_assets_provider_check
    CHECK (provider IN ('netlify-blobs', 'postgres-data-url')),
  CONSTRAINT storage_assets_owner_check
    CHECK (length(owner_type) BETWEEN 1 AND 80 AND length(owner_id) BETWEEN 1 AND 300),
  CONSTRAINT storage_assets_storage_key_check
    CHECK (length(storage_key) BETWEEN 1 AND 600),
  CONSTRAINT storage_assets_mime_type_check
    CHECK (length(mime_type) BETWEEN 1 AND 160),
  CONSTRAINT storage_assets_byte_size_check
    CHECK (byte_size >= 0),
  CONSTRAINT storage_assets_checksum_check
    CHECK (checksum IS NULL OR checksum ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT storage_assets_provider_domain_key_uidx
    UNIQUE (provider, domain, storage_key)
);

CREATE INDEX IF NOT EXISTS storage_assets_user_domain_owner_idx
  ON storage_assets (user_id, domain, owner_type, owner_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS storage_assets_user_key_idx
  ON storage_assets (user_id, provider, domain, storage_key)
  WHERE deleted_at IS NULL;

ALTER TABLE storage_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON storage_assets;
CREATE POLICY trama_user_isolation ON storage_assets
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
