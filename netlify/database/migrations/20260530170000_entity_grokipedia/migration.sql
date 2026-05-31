-- Optional Grokipedia URL on each entity, espejo de wikipedia_url: un
-- hipervínculo de referencia opcional a grokipedia.com, para CUALQUIER tipo.
--
-- Filled by:
--   - edición manual desde el panel de entidad (campo + botón "buscar en
--     Grokipedia" que abre el sitio; el usuario pega la URL del artículo).
--   Grokipedia no tiene API pública de búsqueda (a diferencia de la MediaWiki
--   API), así que el llenado es manual — no hay autocompletado como en Wikipedia.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS grokipedia_url TEXT;
