-- Fase 2 del motor de queries: propiedades de usuario + tags unificados.
--
-- Habilita filtrar/queryear por propiedades arbitrarias (clave/valor) y por
-- tags en TODOS los objetos consultables (hoy los tags sólo viven en notes /
-- tasks / prompts). Es la base de "meetings with the marketing team" y de
-- cortar el conocimiento por etiquetas sin importar el tipo de objeto.
--
-- `properties` es JSONB libre (clave→valor); el catálogo tipado (property_defs)
-- para la UI/NL es un incremento posterior. Los índices GIN hacen los filtros
-- por propiedad/tag eficientes; parciales sobre deleted_at IS NULL (hot path).

ALTER TABLE entities ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE momentos ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE entities ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE momentos ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
-- notes.tags ya existe (con su índice GIN).

CREATE INDEX IF NOT EXISTS entities_properties_gin
  ON entities USING gin (properties jsonb_path_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_properties_gin
  ON quotes USING gin (properties jsonb_path_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS momentos_properties_gin
  ON momentos USING gin (properties jsonb_path_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notes_properties_gin
  ON notes USING gin (properties jsonb_path_ops) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS entities_tags_gin
  ON entities USING gin (tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_tags_gin
  ON quotes USING gin (tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS momentos_tags_gin
  ON momentos USING gin (tags) WHERE deleted_at IS NULL;
