-- Categoría de tareas: cada recordatorio se clasifica en 'trabajo' o 'personal'
-- (dos pestañas por cuadro semanal). Las tareas existentes quedan como 'trabajo'
-- (el DEFAULT las rellena al agregar la columna). Migración NUEVA.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'trabajo'
    CHECK (category IN ('trabajo', 'personal'));

-- Listado por semana + categoría (las pendientes de cada pestaña).
CREATE INDEX IF NOT EXISTS idx_tasks_user_week_category
  ON tasks (user_id, week_start DESC, category)
  WHERE deleted_at IS NULL;
