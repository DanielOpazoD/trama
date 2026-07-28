-- Prompts: historial de versiones.
--
-- Un prompt se afina editándolo, y hasta ahora cada edición pisaba la anterior
-- sin dejar rastro: si la nueva redacción resultaba peor, lo que funcionaba ya
-- no existía. Aquí queda registrada la versión ANTERIOR en cada guardado que
-- cambie título, contenido o colección — no los cambios de favorito ni el
-- contador de usos, que no son texto que se pueda perder.
--
-- Append-only desde el punto de vista del usuario: no se edita una versión, se
-- restaura (y restaurar guarda a su vez la actual, así que nunca es
-- destructivo). El endpoint retiene las últimas 50 por prompt y poda el resto;
-- son unos pocos KB de texto cada una.
--
-- Multiusuario desde el inicio: user_id con FK, RLS forzado, soft delete.

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  prompt_id uuid NOT NULL,
  -- El estado que tenía el prompt ANTES de la edición que creó esta fila.
  title text NOT NULL,
  content text NOT NULL,
  collection text NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL
);

-- El listado siempre es "las versiones de este prompt, de la más nueva a la
-- más vieja", que es también el orden en el que se poda.
CREATE INDEX IF NOT EXISTS idx_prompt_versions_user_prompt
  ON prompt_versions (user_id, prompt_id, created_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_versions_user_id_fk'
  ) THEN
    ALTER TABLE prompt_versions
      ADD CONSTRAINT prompt_versions_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_versions_prompt_id_fk'
  ) THEN
    ALTER TABLE prompt_versions
      ADD CONSTRAINT prompt_versions_prompt_id_fk
      FOREIGN KEY (prompt_id) REFERENCES prompts(id);
  END IF;
END $$;

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trama_user_isolation ON prompt_versions;
CREATE POLICY trama_user_isolation ON prompt_versions
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
