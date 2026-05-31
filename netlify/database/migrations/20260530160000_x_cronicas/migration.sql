-- Crónica de bookmarks de X: un ensayo breve generado por IA sobre "qué venís
-- guardando" (temas, voces, obsesiones recientes). Tabla aparte de `cronicas`
-- (que es mensual y centrada en entidades): esto es sobre los marcadores de X.
-- Se guarda el historial; la vista muestra la más reciente.
CREATE TABLE IF NOT EXISTS x_cronicas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL DEFAULT 'legacy-single-user',
  text         text NOT NULL,
  source_count integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT NOW(),
  provider     text NULL,
  model        text NULL
);

CREATE INDEX IF NOT EXISTS idx_x_cronicas_user
  ON x_cronicas (user_id, generated_at DESC);
