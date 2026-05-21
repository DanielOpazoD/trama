-- Tipos de entidad y relación como datos, no como código.
-- Permite agregar nuevos tipos (podcast, ensayo, pintura, etc.) sin migrar el esquema.
-- La columna entities.type sigue siendo TEXT — opcionalmente puede agregarse FK a
-- entity_types.slug en una migración futura cuando se quiera enforcement estricto.

CREATE TABLE entity_types (
  slug        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE relationship_types (
  slug          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  reverse_label TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with current types so behavior doesn't change on first deploy.
INSERT INTO entity_types (slug, label, sort_order) VALUES
  ('persona',  'persona',  10),
  ('libro',    'libro',    20),
  ('cancion',  'canción',  30),
  ('album',    'álbum',    40),
  ('pelicula', 'película', 50),
  ('obra',     'obra',     60),
  ('concepto', 'concepto', 70),
  ('idea',     'idea',     80);

INSERT INTO relationship_types (slug, label, reverse_label, sort_order) VALUES
  ('influye_en',   'influye en',   'influido por',     10),
  ('cita_a',       'cita a',       'citado por',       20),
  ('responde_a',   'responde a',   'respondido por',   30),
  ('me_llego_por', 'me llegó por', 'me llevó a',       40),
  ('suena_como',   'suena como',   'suena como',       50),
  ('inspira',      'inspira',      'inspirado por',    60),
  ('contradice',   'contradice',   'contradicho por',  70),
  ('asociado_con', 'asociado con', 'asociado con',     80);
