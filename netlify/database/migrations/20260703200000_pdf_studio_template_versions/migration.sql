-- Planillas: historial de versiones de plantillas sincronizadas.
--
-- En cada push del paquete editable, la versión anterior queda registrada
-- aquí (el blob viejo no se sobreescribe: cada guardado usa una key nueva).
-- El endpoint retiene las últimas 10 por plantilla y poda el resto.
--
-- Multiusuario desde el inicio: user_id con FK, RLS forzado, soft delete.

CREATE TABLE IF NOT EXISTS pdf_studio_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  template_id uuid NOT NULL,
  saved_doc_id text NOT NULL,
  name text NOT NULL,
  byte_size integer NOT NULL,
  storage_key text NOT NULL,
  -- Reloj del guardado en el cliente (mismo criterio que la tabla principal).
  saved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_studio_template_versions_user_template
  ON pdf_studio_template_versions (user_id, template_id, saved_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pdf_studio_template_versions_user_id_fk'
  ) THEN
    ALTER TABLE pdf_studio_template_versions
      ADD CONSTRAINT pdf_studio_template_versions_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pdf_studio_template_versions_template_id_fk'
  ) THEN
    ALTER TABLE pdf_studio_template_versions
      ADD CONSTRAINT pdf_studio_template_versions_template_id_fk
      FOREIGN KEY (template_id) REFERENCES pdf_studio_templates(id);
  END IF;
END $$;

ALTER TABLE pdf_studio_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_studio_template_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON pdf_studio_template_versions;
CREATE POLICY trama_user_isolation ON pdf_studio_template_versions
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
