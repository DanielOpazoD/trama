-- Imprenta: PDFs guardados en servidor.
--
-- Multiusuario desde el inicio:
-- - user_id text con FK a users(id)
-- - storage_key namespaceado por endpoint como `${userId}/...`
-- - soft-delete; toda query visible filtra deleted_at IS NULL

CREATE TABLE IF NOT EXISTS pdf_studio_saved_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  saved_doc_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'creation',
  mime_type text NOT NULL DEFAULT 'application/pdf',
  byte_size integer NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL,
  CONSTRAINT pdf_studio_saved_pdfs_kind_check
    CHECK (kind IN ('creation', 'template', 'filled-template'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_studio_saved_pdfs_user_saved_doc
  ON pdf_studio_saved_pdfs (user_id, saved_doc_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_studio_saved_pdfs_storage_key
  ON pdf_studio_saved_pdfs (storage_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pdf_studio_saved_pdfs_user_updated
  ON pdf_studio_saved_pdfs (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pdf_studio_saved_pdfs_user_id_fk'
  ) THEN
    ALTER TABLE pdf_studio_saved_pdfs
      ADD CONSTRAINT pdf_studio_saved_pdfs_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

ALTER TABLE pdf_studio_saved_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_studio_saved_pdfs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON pdf_studio_saved_pdfs;
CREATE POLICY trama_user_isolation ON pdf_studio_saved_pdfs
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
