-- Multi-user schema migration.
--
-- This migration is 100% backward-compatible. All new columns default to
-- 'legacy-single-user', so existing endpoints continue working without
-- any code change. The app stays single-user until Clerk auth is wired up.
--
-- What changes:
--   1. New `users` table with a sentinel legacy row.
--   2. `user_id` column added to all domain tables (NOT NULL, FK → users.id,
--      DEFAULT 'legacy-single-user').
--   3. `spotify_tokens`: old sentinel PK (`id = 'default'`) replaced by
--      `user_id` PK — one token row per user.
--   4. `ai_task_providers`: PK broadened from (task) to (user_id, task).
--   5. `extraction_log` / `error_log`: nullable user_id (historical rows
--      have no user; new requests will carry one).
--   6. Composite indexes for the hot query path: user_id + sort column
--      (WHERE deleted_at IS NULL where applicable).
--
-- DO NOT add DEFAULT drops here. That is a separate, code-coupled step.

-- ============================================================
-- 1. users table
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,   -- Clerk user ID (e.g. user_2abc123xyz)
  email        TEXT UNIQUE,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Legacy sentinel: all pre-auth data belongs to this row.
-- When the real owner signs in via Clerk, the app will migrate
-- their rows to the real user_id in a separate step.
INSERT INTO users (id, display_name)
VALUES ('legacy-single-user', 'Trama (legacy)')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Domain tables — user_id NOT NULL with legacy default
-- ============================================================

ALTER TABLE entities
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

ALTER TABLE relationships
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

ALTER TABLE quotes
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

ALTER TABLE momentos
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

-- momento_entities is a pure junction table; ownership is inferred through
-- momentos. Add user_id here anyway so queries can filter without a join.
ALTER TABLE momento_entities
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

ALTER TABLE chat_threads
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

-- chat_messages is append-only (no deleted_at), owned via its thread.
-- Adding user_id here avoids a join for per-user cost accounting.
ALTER TABLE chat_messages
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

ALTER TABLE proactive_suggestions
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

ALTER TABLE spotify_plays
  ADD COLUMN user_id TEXT NOT NULL
    DEFAULT 'legacy-single-user'
    REFERENCES users(id);

-- ============================================================
-- 3. spotify_tokens: replace sentinel PK with user_id PK
-- ============================================================

-- The old table has: id TEXT PRIMARY KEY DEFAULT 'default'
-- In multi-user, one row per Clerk user; user_id is the natural key.
-- We cannot simply ADD COLUMN user_id as PK while id is still PK,
-- so we:
--   a. add user_id (nullable temporarily),
--   b. back-fill from id (which is 'default' for the single legacy row),
--   c. set NOT NULL + FK,
--   d. drop the old PK,
--   e. add the new PK.

ALTER TABLE spotify_tokens
  ADD COLUMN user_id TEXT;

UPDATE spotify_tokens
  SET user_id = 'legacy-single-user'
  WHERE user_id IS NULL;

ALTER TABLE spotify_tokens
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE spotify_tokens
  ADD CONSTRAINT spotify_tokens_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id);

-- Drop old PK (constraint name is the Postgres default: spotify_tokens_pkey)
ALTER TABLE spotify_tokens
  DROP CONSTRAINT spotify_tokens_pkey;

-- New PK: one token row per user
ALTER TABLE spotify_tokens
  ADD PRIMARY KEY (user_id);

-- ============================================================
-- 4. ai_task_providers: widen PK from (task) to (user_id, task)
-- ============================================================

-- Old PK constraint name (Postgres default): ai_task_providers_pkey

ALTER TABLE ai_task_providers
  ADD COLUMN user_id TEXT;

UPDATE ai_task_providers
  SET user_id = 'legacy-single-user'
  WHERE user_id IS NULL;

ALTER TABLE ai_task_providers
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE ai_task_providers
  ADD CONSTRAINT ai_task_providers_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ai_task_providers
  DROP CONSTRAINT ai_task_providers_pkey;

-- New composite PK: per-user per-task configuration
ALTER TABLE ai_task_providers
  ADD PRIMARY KEY (user_id, task);

-- ============================================================
-- 5. Operational log tables — nullable user_id
-- ============================================================

-- Historical rows have no user; new rows written after Clerk integration
-- will carry the real user_id. FK is intentionally nullable here.

ALTER TABLE extraction_log
  ADD COLUMN user_id TEXT REFERENCES users(id);

ALTER TABLE error_log
  ADD COLUMN user_id TEXT REFERENCES users(id);

-- ============================================================
-- 6. Composite indexes for hot query path (user_id + sort/filter)
-- ============================================================

-- entities: list view + graph load
CREATE INDEX IF NOT EXISTS idx_entities_user_active
  ON entities(user_id, updated_at DESC) WHERE deleted_at IS NULL;

-- relationships: loaded together with entities for graph rendering
CREATE INDEX IF NOT EXISTS idx_relationships_user_active
  ON relationships(user_id, updated_at DESC) WHERE deleted_at IS NULL;

-- quotes: per-entity quotes list
CREATE INDEX IF NOT EXISTS idx_quotes_user_active
  ON quotes(user_id, updated_at DESC) WHERE deleted_at IS NULL;

-- chat_threads: sidebar thread list
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_active
  ON chat_threads(user_id, updated_at DESC) WHERE deleted_at IS NULL;

-- momentos: timeline view
CREATE INDEX IF NOT EXISTS idx_momentos_user_active
  ON momentos(user_id, captured_at DESC) WHERE deleted_at IS NULL;

-- proactive_suggestions: inbox (no deleted_at column on this table)
CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_user
  ON proactive_suggestions(user_id, created_at DESC);
