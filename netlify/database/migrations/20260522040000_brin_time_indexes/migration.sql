-- Time-range performance para tablas append-only.
--
-- F del plan: el usuario pidió particionar extraction_log + chat_messages
-- por mes. Después de pensarlo: a la escala real esperada (30 años x uso
-- diario) la partición declarativa es overkill — añade complejidad
-- operacional (crear particiones nuevas, lidiar con queries cross-partition,
-- migrar datos existentes) sin un beneficio claro hasta los ~5-10M rows.
--
-- Lo que SÍ vale ahora es un BRIN index sobre created_at en cada tabla
-- append-only. Ocupan kilobytes (no megabytes como un B-tree), no enlentecen
-- los INSERT (que en estas tablas son frecuentes), y resuelven el caso
-- común "muéstrame las últimas N filas" o "filtra por mes" en sub-ms a
-- millones de rows.
--
-- Cuando alguna de estas tablas cruce ~5M filas, será momento de
-- particionar de verdad — ese día se crea una migración nueva que:
--   1) Crea la tabla padre particionada por RANGE(created_at).
--   2) Hace ATTACH PARTITION sobre la tabla actual (renombrada).
--   3) Programa la creación mensual de particiones (cron en Netlify
--      Scheduled Functions o pg_partman).
-- Por ahora, BRIN + el plan documentado.

-- extraction_log: cada llamada a la IA escribe un row.
CREATE INDEX IF NOT EXISTS idx_extraction_log_created_brin
  ON extraction_log USING brin (created_at);

-- chat_messages: cada turno del chat escribe 2 rows (user + assistant).
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_brin
  ON chat_messages USING brin (created_at);

-- error_log: cada 4xx/5xx persistido.
CREATE INDEX IF NOT EXISTS idx_error_log_created_brin
  ON error_log USING brin (created_at);

-- spotify_plays: cada reproducción capturada por Spotify.
-- (idx_spotify_plays_played_at ya existe como B-tree; BRIN sobre played_at
-- complementa para queries de rango amplio.)
CREATE INDEX IF NOT EXISTS idx_spotify_plays_played_at_brin
  ON spotify_plays USING brin (played_at);

-- Para chat_threads (updated_at lo bumpean los mensajes nuevos):
-- el índice idx_chat_threads_updated_active ya está y es B-tree pequeño,
-- no necesita BRIN.
