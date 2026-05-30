-- Optional Wikipedia URL on each entity. A diferencia de spotify_url (que es
-- solo para entidades musicales), Wikipedia aplica a CUALQUIER tipo (persona,
-- libro, concepto, lugar, etc.). Es un hipervínculo de referencia, opcional.
--
-- Filled by:
--   - edición manual desde el panel de entidad (botón "buscar en Wikipedia"
--     consulta la MediaWiki API y propone el artículo; el usuario confirma)

ALTER TABLE entities ADD COLUMN IF NOT EXISTS wikipedia_url TEXT;
