-- τ-worlds: Tareas por semana + prioridad con color.
--
-- Rediseño de la sección Tareas. Dejan de organizarse por fecha de
-- vencimiento (ahora opcional y sutil) y pasan a agruparse por SEMANA: cada
-- recordatorio "vive" en una semana (week_start = lunes ISO) y se acumula en
-- un solo lugar. Además cada uno lleva una prioridad con color.
--
-- Reglas del proyecto:
--   - Migración NUEVA (las ya aplicadas son inmutables).
--   - week_start es la fecha del lunes de la semana a la que pertenece.
--   - Backfill de las tareas existentes desde su created_at (la semana en que
--     se crearon), para no perder nada del histórico.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media'
    CHECK (priority IN ('alta', 'media', 'baja')),
  ADD COLUMN IF NOT EXISTS week_start date;

-- Backfill: cada tarea existente cae en la semana (lunes) de su creación.
UPDATE tasks
  SET week_start = date_trunc('week', created_at)::date
  WHERE week_start IS NULL;

-- A partir de acá week_start es obligatorio. Las nuevas caen por defecto en la
-- semana actual; el cliente puede mandar otra (mover de semana).
ALTER TABLE tasks
  ALTER COLUMN week_start SET DEFAULT date_trunc('week', NOW())::date;
ALTER TABLE tasks
  ALTER COLUMN week_start SET NOT NULL;

-- Listado por semana (las más recientes primero), pendientes arriba.
CREATE INDEX IF NOT EXISTS idx_tasks_user_week
  ON tasks (user_id, week_start DESC, done)
  WHERE deleted_at IS NULL;
