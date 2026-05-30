-- Integración con X (Twitter): bookmarks del usuario.
--
-- x_tokens: tokens OAuth2 (PKCE) de la cuenta de X conectada, uno por usuario
--   (multi-user desde el arranque, PK user_id). offline.access da refresh_token.
-- x_bookmarks: tweets marcados (bookmarks) traídos de la API v2. Append-only,
--   dedup por (user_id, tweet_id). Nada entra a la trama sin que el usuario lo
--   promueva (igual criterio que spotify_plays).
--
-- Inerte hasta configurar X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI.

CREATE TABLE IF NOT EXISTS x_tokens (
  user_id        TEXT PRIMARY KEY DEFAULT 'legacy-single-user',
  x_user_id      TEXT,
  username       TEXT,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  scopes         TEXT,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER x_tokens_set_updated_at
  BEFORE UPDATE ON x_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS x_bookmarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id         TEXT NOT NULL,
  text             TEXT NOT NULL,
  author_id        TEXT,
  author_name      TEXT,
  author_username  TEXT,
  tweet_created_at TIMESTAMPTZ,
  url              TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id          TEXT NOT NULL DEFAULT 'legacy-single-user'
);

-- Idempotencia: el mismo bookmark del mismo usuario es el mismo evento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_x_bookmarks_unique
  ON x_bookmarks(user_id, tweet_id);

CREATE INDEX IF NOT EXISTS idx_x_bookmarks_user
  ON x_bookmarks(user_id, captured_at DESC);
