-- Spotify integration tables.
--
-- spotify_tokens: holds the OAuth access/refresh tokens for the connected
-- Spotify account. Single-row (Trama is currently single-user).
--
-- spotify_plays: raw listening events fetched from Spotify's "recently played"
-- endpoint. One row per (track, played_at). Audit log — nothing here is
-- visible in the trama unless the user explicitly promotes it.

CREATE TABLE spotify_tokens (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  spotify_user_id TEXT,
  display_name    TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  scopes          TEXT,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER spotify_tokens_set_updated_at
  BEFORE UPDATE ON spotify_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE spotify_plays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id      TEXT NOT NULL,
  track_name    TEXT NOT NULL,
  artist_ids    TEXT[] NOT NULL DEFAULT '{}',
  artist_names  TEXT[] NOT NULL DEFAULT '{}',
  album_id      TEXT,
  album_name    TEXT,
  duration_ms   INTEGER,
  played_at     TIMESTAMPTZ NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: same track played at the same instant is the same event.
CREATE UNIQUE INDEX idx_spotify_plays_unique
  ON spotify_plays(track_id, played_at);

CREATE INDEX idx_spotify_plays_played_at
  ON spotify_plays(played_at DESC);

CREATE INDEX idx_spotify_plays_artist_names_gin
  ON spotify_plays USING GIN(artist_names);
