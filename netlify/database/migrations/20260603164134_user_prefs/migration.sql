-- Preferencias de UI por usuario (sincronizadas entre dispositivos): un JSONB
-- extensible por usuario. Hoy guarda qué subsecciones del mundo Notas se ven y
-- cuál es el mundo default; mañana, lo que haga falta — sin nuevas migraciones.
--
-- Una fila por usuario; el endpoint hace MERGE SUPERFICIAL (jsonb ||) de las
-- claves enviadas. Convenciones: user_id text con default legacy; scope por
-- usuario; FK a users(id). Migración NUEVA (las aplicadas son inmutables).

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id text PRIMARY KEY DEFAULT 'legacy-single-user',
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_prefs_user_id_fk'
  ) THEN
    ALTER TABLE user_prefs
      ADD CONSTRAINT user_prefs_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;
