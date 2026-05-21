-- Per-task LLM provider configuration.
--
-- Until now AI_PROVIDER was a single env var for everything. This table lets
-- the user pick a different model per task (extract, suggest, reclassify,
-- reflect, chat, vision, panel). If a row doesn't exist for a given task,
-- the function falls back to AI_PROVIDER (the env var).
--
-- task: stable slug. The set is open — adding a new task means adding a row.
-- provider: deepseek | openai | anthropic | gemini (validated in code).
-- model: optional override; if NULL, the provider's default model is used.
-- verify_with: optional second provider for cross-verification (block 2).
--
-- Single-user assumption (same as spotify_tokens), so no user_id.

CREATE TABLE ai_task_providers (
  task         TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  model        TEXT,
  verify_with  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER ai_task_providers_set_updated_at
  BEFORE UPDATE ON ai_task_providers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
