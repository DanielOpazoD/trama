-- Planillas: estructura editable de plantillas sincronizada al servidor.
--
-- Complementa pdf_studio_saved_pdfs (que guarda el PDF plano ya renderizado):
-- aquí vive el PAQUETE editable (páginas, casilleros, estilos + fuentes) para
-- que la biblioteca de planillas funcione desde cualquier dispositivo.
--
-- Sólo se sincronizan plantillas limpias (kind template, sin valores): las
-- copias con datos se quedan en el dispositivo — pueden contener datos de
-- pacientes y no deben salir del equipo.
--
-- Multiusuario desde el inicio:
-- - user_id text con FK a users(id)
-- - storage_key namespaceado por endpoint como `${userId}/...`
-- - soft-delete; toda query visible filtra deleted_at IS NULL

CREATE TABLE IF NOT EXISTS pdf_studio_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  saved_doc_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ready',
  page_count integer NOT NULL DEFAULT 0,
  field_count integer NOT NULL DEFAULT 0,
  byte_size integer NOT NULL,
  storage_key text NOT NULL,
  -- Momento de guardado en el cliente: es el reloj del merge last-write-wins
  -- entre dispositivos (updated_at sólo audita la fila).
  saved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL,
  CONSTRAINT pdf_studio_templates_status_check
    CHECK (status IN ('draft', 'ready'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_studio_templates_user_saved_doc
  ON pdf_studio_templates (user_id, saved_doc_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_studio_templates_storage_key
  ON pdf_studio_templates (storage_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pdf_studio_templates_user_updated
  ON pdf_studio_templates (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pdf_studio_templates_user_id_fk'
  ) THEN
    ALTER TABLE pdf_studio_templates
      ADD CONSTRAINT pdf_studio_templates_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

ALTER TABLE pdf_studio_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_studio_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON pdf_studio_templates;
CREATE POLICY trama_user_isolation ON pdf_studio_templates
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
