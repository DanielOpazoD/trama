-- Embeddings: dense vector representations of entities and quotes.
--
-- Used for two things:
--   1. Semantic search ("¿qué tengo sobre la muerte como acto creativo?"
--      returns relevant entities/quotes even if the word "muerte" doesn't
--      appear literally).
--   2. Duplicate detection on entity creation ("Borges" ≈ "Jorge Luis Borges"
--      → suggest match-in-place instead of creating a new row).
--
-- We use OpenAI's text-embedding-3-small (1536 dims) by default. The model
-- name is stored alongside so we can re-embed if we ever change models.
--
-- Neon supports pgvector as a managed extension; the CREATE EXTENSION line is
-- idempotent and free.
--
-- We don't create an ivfflat index here — at this user's scale (<10k rows)
-- sequential scan over cosine distance is fine and avoids the lists tuning
-- gymnastics. Add the index in a separate migration if/when the trama
-- grows past that.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding_at TIMESTAMPTZ;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS embedding_at TIMESTAMPTZ;
