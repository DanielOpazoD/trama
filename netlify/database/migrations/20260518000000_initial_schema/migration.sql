CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  year        INTEGER,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE relationships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  source     TEXT,
  context    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_relationships_from   ON relationships(from_id);
CREATE INDEX idx_relationships_to     ON relationships(to_id);
CREATE INDEX idx_quotes_entity        ON quotes(entity_id);
CREATE INDEX idx_entities_created_at  ON entities(created_at DESC);
