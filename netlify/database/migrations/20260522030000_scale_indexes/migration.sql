-- Índices pensados para los próximos 30 años: la diferencia entre sentir
-- una app de uso personal y una infraestructura que aguanta 100k+ entradas
-- es estos índices.
--
-- Tres bloques:
--   1) HNSW sobre embeddings: búsqueda semántica pasa de O(N) a O(log N).
--      A 100k vectores, una query semántica baja de ~500ms a ~5ms.
--   2) Índices compuestos (created_at DESC, id DESC) para la paginación
--      por cursor — el patrón que ya usa /api/quotes y que se replicará
--      en /api/entities y /api/relationships.
--   3) Partial indexes auxiliares que ya no estaban.
--
-- Nota: HNSW requiere pgvector ≥ 0.5. Neon corre 0.7+, así que esto va.
-- En Netlify cada migración corre en una transacción, así que no podemos
-- usar CREATE INDEX CONCURRENTLY. A la escala actual de embeddings el
-- build es instantáneo; en el futuro, si esta migración corriese sobre
-- datos masivos, se haría manualmente fuera del migrador.

-- ---------- 1) HNSW sobre embeddings ----------
-- vector_cosine_ops porque eso es lo que usamos en /api/search.

CREATE INDEX IF NOT EXISTS entities_embedding_hnsw
  ON entities USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS quotes_embedding_hnsw
  ON quotes USING hnsw (embedding vector_cosine_ops);

-- ---------- 2) Compuestos para cursor pagination ----------
-- El cursor compara (created_at, id) DESC; un índice compuesto deja al
-- planner usar una sola búsqueda en árbol en vez de scan + sort.

CREATE INDEX IF NOT EXISTS idx_entities_cursor
  ON entities (created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_cursor
  ON quotes (created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_relationships_cursor
  ON relationships (created_at DESC, id DESC) WHERE deleted_at IS NULL;

-- ---------- 3) Defensive partials ----------
-- entities.type es común en filtros ("dame todos los libros"). Sin un
-- índice por type, a 100k haría seq scan.
CREATE INDEX IF NOT EXISTS idx_entities_type_active
  ON entities (type) WHERE deleted_at IS NULL;

-- Relationships filtradas por type aparecen en /api/graph/neighbors
-- (cuando llegue) y en el grafo agrupado por tipo.
CREATE INDEX IF NOT EXISTS idx_relationships_type_active
  ON relationships (type) WHERE deleted_at IS NULL;
