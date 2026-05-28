-- Bloque #5: Atlas temático — agrupa las entidades de la trama por
-- cercanía semántica (embeddings) en "constelaciones" nombradas por IA.
--
-- Es un artefacto GENERADO con caché, igual que las Crónicas: el
-- clustering corre en el servidor sobre los embeddings existentes y la
-- IA nombra cada constelación en UNA sola llamada. El resultado se
-- persiste como snapshot; las lecturas normales solo lo leen (cero costo
-- LLM). El usuario puede pedir "regenerar atlas" cuando su trama creció.
--
-- Single row per user — guardamos solo el último snapshot (el atlas es
-- una foto del estado actual, no un historial). UNIQUE (user_id) blinda
-- doble-click / requests concurrentes vía ON CONFLICT.
--
-- `clusters` es un JSON array de la forma:
--   [{ "id": "c-0", "name": "...", "summary": "...", "memberIds": [uuid, ...] }]
-- Guardamos memberIds (no las entidades enteras) para que el GET resuelva
-- los miembros vivos al vuelo (filtrando soft-deletes) sin regenerar.

CREATE TABLE IF NOT EXISTS atlas_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'legacy-single-user',
  -- Cuántas entidades (con embedding) entraron en este snapshot. Sirve
  -- para mostrar "atlas de 142 entidades" y para decidir si vale la pena
  -- ofrecer regenerar (la trama creció mucho desde la última foto).
  entity_count int NOT NULL DEFAULT 0,
  clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT NOW(),
  -- Trazabilidad del LLM que nombró las constelaciones.
  provider text NULL,
  model text NULL,
  UNIQUE (user_id)
);
