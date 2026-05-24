-- Momentos: la dimensión TEMPORAL de la trama.
--
-- Hasta ahora la trama mapeaba "qué piensas" (entities + quotes + relationships)
-- pero no "qué viviste cuándo". Momentos cubre esa capa: cada fila es algo
-- que pasó/viste/leíste en un instante específico, con su propio shape.
--
-- Tres kinds posibles:
--   'nota'    → solo texto que se te ocurrió ese día
--   'recorte' → algo del mundo (tweet, link, screenshot) que te llamó la atención
--   'foto'    → un recuerdo visual con caption opcional
--
-- El payload jsonb varía por kind (sin discriminated union en SQL —
-- validamos en TS):
--
--   nota:    { bodyText: string }
--   recorte: { url?, title?, bodyText?, source?, author?, screenshotKey? }
--   foto:    { storageKey, width, height, caption?, exifDate? }
--
-- captured_at es el "cuándo pasó" según el usuario (puede ser past o now);
-- created_at es cuándo lo guardó. Los dos NO suelen coincidir — una foto
-- subida hoy puede tener captured_at de hace 5 años.
--
-- Linking: tabla momento_entities relaciona N:M con entidades. Cuando la
-- IA extrae personas/lugares/conceptos mencionados, se vinculan acá. Eso
-- vuelve a las entidades el eje del grafo aún para datos visuales.

CREATE TABLE momentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL
                    CHECK (kind IN ('nota', 'recorte', 'foto')),
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  note            TEXT,
  origin          JSONB NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  embedding       vector(1536),
  embedding_model TEXT,
  embedding_at    TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index principal: timeline cronológico filtrando soft-deletes.
CREATE INDEX idx_momentos_captured_at
  ON momentos(captured_at DESC)
  WHERE deleted_at IS NULL;

-- Index por kind para filtros rápidos ("solo fotos", "solo recortes").
CREATE INDEX idx_momentos_kind
  ON momentos(kind)
  WHERE deleted_at IS NULL;

-- HNSW para semantic search dentro de Momentos. Cosine distance porque
-- las queries van a ser "¿qué guardé sobre X?" → match en bodyText/caption.
CREATE INDEX momentos_embedding_hnsw
  ON momentos USING hnsw (embedding vector_cosine_ops)
  WHERE deleted_at IS NULL;

-- Junction table: un momento puede mencionar/mostrar N entidades, y una
-- entidad puede aparecer en N momentos. CASCADE en ambas direcciones —
-- si borras la entidad o el momento, el vínculo se va. (Soft-delete del
-- momento no cascadea: el FK se mantiene; el query filtra deleted_at en
-- la app.)
CREATE TABLE momento_entities (
  momento_id UUID NOT NULL REFERENCES momentos(id) ON DELETE CASCADE,
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (momento_id, entity_id)
);

-- Reverse-lookup: dado un entity_id, qué momentos lo mencionan.
-- Caso de uso: en EntityHeader mostrar "aparece en N momentos" con link.
CREATE INDEX idx_momento_entities_entity
  ON momento_entities(entity_id);
