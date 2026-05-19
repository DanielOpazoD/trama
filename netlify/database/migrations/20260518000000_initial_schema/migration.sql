CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigger function: bumps updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- entities ----------

CREATE TABLE entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  year        INTEGER,
  description TEXT,
  position_x  DOUBLE PRECISION,
  position_y  DOUBLE PRECISION,
  origin      JSONB NOT NULL DEFAULT '{"kind": "manual"}'::jsonb
                CHECK (origin ? 'kind'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER entities_set_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- relationships ----------

CREATE TABLE relationships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  notes      TEXT,
  origin     JSONB NOT NULL DEFAULT '{"kind": "manual"}'::jsonb
                CHECK (origin ? 'kind'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER relationships_set_updated_at
  BEFORE UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- quotes ----------

CREATE TABLE quotes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  source     TEXT,
  context    TEXT,
  origin     JSONB NOT NULL DEFAULT '{"kind": "manual"}'::jsonb
                CHECK (origin ? 'kind'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER quotes_set_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- indexes ----------

-- Partial indexes only over non-deleted rows; this is the common query path.
CREATE INDEX idx_entities_created_at_active
  ON entities(created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_relationships_from_active
  ON relationships(from_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_relationships_to_active
  ON relationships(to_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_quotes_entity_active
  ON quotes(entity_id) WHERE deleted_at IS NULL;

-- Origin kind lookup: useful for filtering by 'manual' vs 'ai'.
CREATE INDEX idx_entities_origin_kind
  ON entities ((origin->>'kind')) WHERE deleted_at IS NULL;
