-- ω-E: pinned timestamp para Citas favoritas
--
-- El usuario puede marcar/desmarcar una cita como favorita (estrella).
-- Las favoritas se ordenan primero en la lista. Usamos timestamp (no
-- boolean) para que en el futuro podamos ordenar las favoritas entre
-- sí por orden de marcado (más reciente arriba). NULL = no favorita.
--
-- Patrón consistente con los demás soft-state del proyecto (deleted_at,
-- ai_reflection_at): timestamptz nullable que indica "cuándo ocurrió X".

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL;

-- Índice parcial — solo las filas con pinned_at no nulo. A muchos
-- usuarios, las "favoritas" son <5% del total; un índice parcial pesa
-- una fracción de uno completo. ORDER BY pinned_at DESC es la query
-- típica (favoritas más recientes arriba).
CREATE INDEX IF NOT EXISTS idx_quotes_pinned_at
  ON quotes (pinned_at DESC)
  WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;
