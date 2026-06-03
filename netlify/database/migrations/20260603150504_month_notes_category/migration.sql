-- Notas del mes por categoría (Trabajo / Personal), igual que las tareas.
-- Antes había una sola nota libre por (usuario, mes); ahora hay una por
-- (usuario, mes, categoría). Las notas existentes caen bajo 'trabajo' (default).
--
-- Convenciones: idempotente (migraciones aplicadas son inmutables); soft-delete
-- con deleted_at; scope por usuario. Migración NUEVA.

-- 1) Columna category con default 'trabajo' → las filas existentes quedan ahí.
ALTER TABLE month_notes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'trabajo';

-- 2) CHECK de valores válidos (guardado para ser idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'month_notes_category_check'
  ) THEN
    ALTER TABLE month_notes
      ADD CONSTRAINT month_notes_category_check
      CHECK (category IN ('trabajo', 'personal'));
  END IF;
END $$;

-- 3) La unicidad pasa a ser por (usuario, mes, categoría): dos notas por mes.
--    El upsert del endpoint apunta a este índice.
DROP INDEX IF EXISTS idx_month_notes_user_month;
CREATE UNIQUE INDEX IF NOT EXISTS idx_month_notes_user_month_cat
  ON month_notes (user_id, month_key, category)
  WHERE deleted_at IS NULL;
