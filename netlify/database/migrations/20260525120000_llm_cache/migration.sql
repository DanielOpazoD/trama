-- DD6 (audit #3): cache persistente de respuestas LLM.
--
-- El cache en memoria del Lambda (Map en _lib/llm/cache.ts) se pierde
-- con cada cold start. En patrones reales:
--   - Reload de la página → 5-10 cold starts (cada handler distinto)
--   - Inactividad de 15 min → Lambda recycled
--   - Deploy nuevo → todos los warm pools desaparecen
--
-- Cada cold start = re-pago de tokens al provider para prompts que ya
-- habíamos respondido antes. Esta tabla sobrevive a los cold starts y
-- al recycling — solo expira por TTL, no por process lifecycle.
--
-- Hash es SHA-256 hex (64 chars). Lookup primario.
-- content JSONB porque puede ser objeto (modo json) o string (modo text).
-- usage_* para audit + análisis de ahorro en HealthPanel futuro.

CREATE TABLE IF NOT EXISTS llm_cache (
  hash         TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  content      JSONB NOT NULL,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  cost_cents   NUMERIC(12, 4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

-- Cleanup eficiente: queries periódicas borran rows expirados.
CREATE INDEX IF NOT EXISTS llm_cache_expires_at_idx
  ON llm_cache (expires_at);

-- Para análisis "cuánto ahorramos en cache hits": ordenar por created_at
-- y filtrar por provider/model en HealthPanel.
CREATE INDEX IF NOT EXISTS llm_cache_provider_created_idx
  ON llm_cache (provider, created_at DESC);
