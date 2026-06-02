-- Mundo Notas Premium: biblioteca de prompts, vault de claves y anexos.
--
-- Reglas del proyecto:
--   - user_id text con default legacy.
--   - soft-delete para todas las tablas de usuario.
--   - origin JSONB, nunca string.
--   - RLS se habilita acá porque no se editan migraciones ya aplicadas.

CREATE TABLE IF NOT EXISTS prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  title text NOT NULL,
  content text NOT NULL,
  collection text NULL,
  tags text[] NOT NULL DEFAULT '{}',
  variables text[] NOT NULL DEFAULT '{}',
  favorite boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NULL,
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_user_favorite_updated
  ON prompts (user_id, favorite DESC, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prompts_collection
  ON prompts (user_id, collection)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prompts_tags
  ON prompts USING GIN (tags)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  label text NOT NULL,
  secret_value text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  service text NULL,
  username text NULL,
  notes text NULL,
  favorite boolean NOT NULL DEFAULT false,
  critical boolean NOT NULL DEFAULT false,
  expires_at date NULL,
  last_rotated_at date NULL,
  copied_at timestamptz NULL,
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL,
  CONSTRAINT secrets_kind_check CHECK (
    kind IN ('api_key', 'token', 'pin', 'license', 'recovery_code', 'password', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_secrets_user_kind_updated
  ON secrets (user_id, kind, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_secrets_expiry
  ON secrets (user_id, expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS notas_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  storage_key text NOT NULL,
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL,
  CONSTRAINT notas_attachments_owner_type_check CHECK (owner_type IN ('note', 'prompt'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notas_attachments_storage_key
  ON notas_attachments (storage_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notas_attachments_owner
  ON notas_attachments (user_id, owner_type, owner_id, created_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prompts_user_id_fk'
  ) THEN
    ALTER TABLE prompts
      ADD CONSTRAINT prompts_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'secrets_user_id_fk'
  ) THEN
    ALTER TABLE secrets
      ADD CONSTRAINT secrets_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notas_attachments_user_id_fk'
  ) THEN
    ALTER TABLE notas_attachments
      ADD CONSTRAINT notas_attachments_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

DO $$
DECLARE
  private_table text;
  private_tables text[] := ARRAY[
    'prompts',
    'secrets',
    'notas_attachments'
  ];
BEGIN
  FOREACH private_table IN ARRAY private_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', private_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', private_table);

    EXECUTE format('DROP POLICY IF EXISTS trama_user_isolation ON %I', private_table);
    EXECUTE format(
      $policy$
        CREATE POLICY trama_user_isolation ON %I
          USING (
            current_setting('app.rls_bypass', true) = 'system'
            OR
            user_id = NULLIF(current_setting('app.current_user_id', true), '')
          )
          WITH CHECK (
            current_setting('app.rls_bypass', true) = 'system'
            OR
            user_id = NULLIF(current_setting('app.current_user_id', true), '')
          )
      $policy$,
      private_table
    );
  END LOOP;
END $$;
