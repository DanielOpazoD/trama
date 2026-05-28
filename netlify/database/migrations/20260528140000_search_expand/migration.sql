-- Expandir la búsqueda léxica a más del catálogo.
--
-- Hasta ahora solo entities (name + description) y quotes (text + context +
-- source) tenían search_vector. El buscador global (Command Palette) ahora
-- alcanza también: el `essay` de una entidad, los momentos, las crónicas y
-- los mensajes de chat. Todo con el mismo diccionario 'simple' (sin stemming,
-- language-agnostic) que el resto del esquema, para consistencia de ranking.
--
-- Todas las expresiones de los GENERATED son inmutables (->>, coalesce, ||,
-- to_tsvector con config constante, setweight) — requisito de Postgres para
-- columnas generadas STORED.

-- 1) entities: incluir `essay` en el vector (peso D, debajo de
--    name/description). No se puede ALTERar la expresión de un GENERATED en
--    el lugar, así que drop + recreate de la columna y su índice GIN. El
--    índice trigram sobre `name` (idx_entities_name_trgm) NO se toca.
DROP INDEX IF EXISTS idx_entities_search;
ALTER TABLE entities DROP COLUMN IF EXISTS search_vector;
ALTER TABLE entities
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(essay, '')), 'D')
  ) STORED;
CREATE INDEX idx_entities_search ON entities USING GIN(search_vector) WHERE deleted_at IS NULL;

-- 2) momentos: vector generado sobre las partes textuales del payload JSONB
--    + el note. bodyText/caption pesan A (el cuerpo), title B, source/author
--    /note C.
ALTER TABLE momentos
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(payload->>'bodyText', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(payload->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(payload->>'source', '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(payload->>'author', '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(note, '')), 'C')
  ) STORED;
CREATE INDEX idx_momentos_search ON momentos USING GIN(search_vector) WHERE deleted_at IS NULL;

-- 3) cronicas: vector sobre el texto del ensayo mensual. Sin deleted_at
--    (no es soft-deletable), índice completo.
ALTER TABLE cronicas
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(text, ''))
  ) STORED;
CREATE INDEX idx_cronicas_search ON cronicas USING GIN(search_vector);

-- 4) chat_messages: vector sobre content. Append-only (sin deleted_at); el
--    filtro de soft-delete se aplica por JOIN al thread al consultar.
ALTER TABLE chat_messages
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(content, ''))
  ) STORED;
CREATE INDEX idx_chat_messages_search ON chat_messages USING GIN(search_vector);
