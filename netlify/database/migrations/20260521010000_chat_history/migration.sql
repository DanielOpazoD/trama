-- Chat with the trama: threads + messages.
--
-- Each thread is a conversation. Messages alternate user → assistant.
-- Assistant messages may carry a `proposal` payload — structured suggestions
-- (entities/relationships/quotes/reclassifications) that the UI renders as
-- inline buttons the user can accept.
--
-- Soft delete via deleted_at, same convention as the rest of the schema.

CREATE TABLE chat_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER chat_threads_set_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_chat_threads_updated_active
  ON chat_threads(updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  proposal    JSONB,                          -- only set on assistant messages with structured suggestions
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  cost_cents  NUMERIC(10, 4),
  provider    TEXT,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_thread_created
  ON chat_messages(thread_id, created_at);
