-- Tema de cada bookmark (clasificación por IA): IA, Medicina, Cripto,
-- Tecnología, Ciencia, Finanzas, Política, Cultura, Otro. NULL = sin clasificar
-- todavía. La clasificación corre on-demand (botón) y automática tras el sync.
ALTER TABLE x_bookmarks ADD COLUMN IF NOT EXISTS topic TEXT;

-- Índice para encontrar rápido los que faltan clasificar (topic IS NULL).
CREATE INDEX IF NOT EXISTS idx_x_bookmarks_unclassified
  ON x_bookmarks (user_id)
  WHERE deleted_at IS NULL AND topic IS NULL;
