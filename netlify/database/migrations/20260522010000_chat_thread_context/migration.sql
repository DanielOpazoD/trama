-- Chat thread context: which section spawned the thread.
--
-- Until now every chat thread lived in the dedicated /chat view, untyped.
-- The AskBar in other sections (Citas, Entidades, etc.) was stateless — each
-- press of Enter was a fresh request with no memory of previous turns. This
-- column lets us reuse the chat_threads + chat_messages infrastructure to
-- give the AskBar conversational memory per section, while still keeping the
-- "free" chat (NULL context) as the dedicated view.
--
-- Values used by the app:
--   NULL                 — free-form chat (the existing /chat view)
--   'inicio' | 'grafo' | 'entidades' | 'citas' | 'relaciones'
--   'escuchas' | 'sugerencias'
--
-- Open set on purpose — adding a new section means just storing its slug.

ALTER TABLE chat_threads ADD COLUMN context TEXT;

-- Partial index so the lookup "what's the open thread for section X" stays cheap.
CREATE INDEX idx_chat_threads_context
  ON chat_threads (context)
  WHERE deleted_at IS NULL AND context IS NOT NULL;
