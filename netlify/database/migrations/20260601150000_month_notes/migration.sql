-- Notas globales del mes (Tareas): un cuadro de texto libre por mes, al lado
-- del navegador de meses. Una fila por (usuario, mes 'YYYY-MM').
--
-- Convenciones: user_id text con default legacy; soft-delete con deleted_at;
-- scope por usuario en las queries. Migración NUEVA (las aplicadas son
-- inmutables).

CREATE TABLE IF NOT EXISTS month_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  -- Mes al que pertenece la nota, como 'YYYY-MM'.
  month_key text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL,
  CONSTRAINT month_notes_month_key_format CHECK (month_key ~ '^\d{4}-\d{2}$')
);

-- Una sola nota por usuario y mes (upsert sobre este índice).
CREATE UNIQUE INDEX IF NOT EXISTS idx_month_notes_user_month
  ON month_notes (user_id, month_key)
  WHERE deleted_at IS NULL;

-- FK a users(id) — integridad por usuario, como el resto de tablas per-usuario.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'month_notes_user_id_fk'
  ) THEN
    ALTER TABLE month_notes
      ADD CONSTRAINT month_notes_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;
