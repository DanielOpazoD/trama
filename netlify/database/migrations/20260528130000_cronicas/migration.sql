-- U-4: Crónicas — ensayos mensuales generados por IA que conectan
-- las entidades más tocadas del mes anterior. Aparecen en Inicio.
--
-- El día 1 de cada mes, cuando el usuario entra a Inicio, ofrecemos
-- generar la crónica del mes anterior (lazy, on-demand — no cron). Una
-- vez generada queda persistida y nunca se regenera automáticamente.
-- El usuario puede pedir "regenerar" manualmente (deferred).
--
-- Single row per (user, year, month) — UNIQUE constraint blinda el
-- caso de doble-click o requests concurrentes.

CREATE TABLE IF NOT EXISTS cronicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month >= 1 AND month <= 12),
  text text NOT NULL,
  -- JSON array de entity IDs que la crónica conectó. Permite linkear
  -- desde la crónica a las entidades que la inspiraron sin necesidad
  -- de parsearlas del texto.
  source_entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT NOW(),
  -- Trazabilidad: qué LLM produjo esta crónica. Útil cuando la calidad
  -- cambia entre modelos y querés comparar.
  provider text NULL,
  model text NULL,
  UNIQUE (user_id, year, month)
);

-- Listado típico: las crónicas del usuario, las más recientes primero.
CREATE INDEX IF NOT EXISTS idx_cronicas_user_year_month
  ON cronicas (user_id, year DESC, month DESC);
