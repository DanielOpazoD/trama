-- Expand entity types so the LLM can pick something better than "persona"
-- for bands, writers, filmmakers, etc.
--
-- The old set ('persona' for any human, 'obra' for anything made by one) was
-- too coarse: the AI extractor was forced to call King Crimson and Pink Floyd
-- 'persona' because no closer type existed. New types refine the distinctions
-- the user actually makes in conversation.

INSERT INTO entity_types (slug, label, sort_order) VALUES
  ('escritor',   'escritor',         11),
  ('filosofo',   'filósofo',         12),
  ('musico',     'músico',           13),
  ('banda',      'banda / grupo',    14),
  ('director',   'director',         15),
  ('artista',    'artista',          16),
  ('cientifico', 'científico',       17),
  ('ensayo',     'ensayo',           21),
  ('poema',      'poema',            22),
  ('articulo',   'artículo',         23),
  ('podcast',    'podcast',          31),
  ('disco',      'disco',            41),  -- alias semántico para álbum largo / EP
  ('serie',      'serie',            51),
  ('documental', 'documental',       52),
  ('lugar',      'lugar',            90),
  ('evento',     'evento',           91)
ON CONFLICT (slug) DO NOTHING;
