-- Log of every LLM extraction call. One row per /api/extract invocation.
-- Persists what was asked, what was proposed, what was accepted, and cost.
-- Lets us: audit prompts, see total LLM spend, find which texts produced
-- the best proposals, and eventually use this as training data for prompt iteration.

CREATE TABLE extraction_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text      TEXT NOT NULL,
  proposal        JSONB NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  tokens_in       INTEGER NOT NULL DEFAULT 0,
  tokens_out      INTEGER NOT NULL DEFAULT 0,
  cost_cents      NUMERIC(10, 4) NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  accepted_ids    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  rejected_count  INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extraction_log_created ON extraction_log(created_at DESC);
CREATE INDEX idx_extraction_log_provider ON extraction_log(provider);
