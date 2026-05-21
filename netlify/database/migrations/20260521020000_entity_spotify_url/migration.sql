-- Optional Spotify URL on each entity. Lets music-related entities (banda,
-- musico, cancion, album, disco) carry a clickable "open in Spotify" link.
--
-- Filled by:
--   - the playlist importer (artist/track/album URLs come from the Spotify API)
--   - manual edit from NodeDetailPanel
--   - the chat assistant, when it proposes new music with a known URL

ALTER TABLE entities ADD COLUMN IF NOT EXISTS spotify_url TEXT;
