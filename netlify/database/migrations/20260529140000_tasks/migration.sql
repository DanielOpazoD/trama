-- τ-worlds Fase 3: Trama Notas — Tareas (módulo liviano de pendientes).
--
-- Hermano de `notes`, en el mismo mundo (Trama Notas). Una tarea es título +
-- detalle opcional + fecha de vencimiento opcional + estado (hecho/pendiente),
-- con las mismas #etiquetas derivadas del texto que las notas.
--
-- Convenciones del proyecto:
--   - user_id text con default legacy (igual que notes / resto multi-user).
--   - soft-delete (deleted_at); las queries filtran `deleted_at IS NULL`.
--   - tags como text[] derivado de título+detalle en el server (parseTags).

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  title text NOT NULL,
  detail text NULL,
  done boolean NOT NULL DEFAULT false,
  -- Vencimiento opcional (solo fecha, sin hora — es un pendiente, no un evento).
  due_date date NULL,
  -- Cuándo se marcó como hecha (para "completadas hoy" y orden); null si pendiente.
  completed_at timestamptz NULL,
  -- Etiquetas (#tag) extraídas de título+detalle, en minúsculas y sin el '#'.
  tags text[] NOT NULL DEFAULT '{}',
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz NULL
);

-- Listado típico: pendientes primero, luego por vencimiento (las sin fecha al
-- final) y por recencia. Índice parcial sobre las no borradas.
CREATE INDEX IF NOT EXISTS idx_tasks_user_done_due
  ON tasks (user_id, done, due_date)
  WHERE deleted_at IS NULL;

-- Filtro por etiqueta (tag = ANY(tags)).
CREATE INDEX IF NOT EXISTS idx_tasks_tags
  ON tasks USING GIN (tags)
  WHERE deleted_at IS NULL;
