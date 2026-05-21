-- Full-text search via Postgres tsvector + GIN indexes.
-- Uses the 'simple' dictionary (no stemming, language-agnostic) which works well
-- for Spanish names/titles where we don't want "Camus" to be stemmed weirdly.
-- If you want Spanish-aware stemming, swap to 'spanish' but be aware of side effects.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE entities
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX idx_entities_search ON entities USING GIN(search_vector) WHERE deleted_at IS NULL;
CREATE INDEX idx_entities_name_trgm ON entities USING GIN(name gin_trgm_ops) WHERE deleted_at IS NULL;

ALTER TABLE quotes
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(text, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(context, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(source, '')), 'C')
  ) STORED;

CREATE INDEX idx_quotes_search ON quotes USING GIN(search_vector) WHERE deleted_at IS NULL;
