-- Backfill user_id en las tablas de logs operacionales.
--
-- Contexto: la migración 20260526 agregó `user_id` como columna nullable
-- en `extraction_log` y `error_log` (no NOT NULL porque las rows
-- históricas no tenían dueño). Mientras todo el tráfico siga siendo
-- single-user, esas rows pertenecen implícitamente al usuario legacy.
--
-- Esta migración pone explícitamente 'legacy-single-user' en cualquier
-- row con user_id IS NULL. Eso permite:
--
--   1. Los GETs de /api/extraction-log y /api/error-log pueden filtrar
--      con `WHERE user_id = ${userId}` limpio, sin un `OR user_id IS
--      NULL` que sería un agujero de privacidad cuando Clerk se active.
--
--   2. Los INSERTs nuevos (parte del mismo PR) siempre pasarán un
--      user_id, así que esta es una operación one-shot. Después de esta
--      migración + el código, ninguna row nueva entra con NULL.
--
-- La columna sigue siendo nullable a propósito — no queremos sumarle
-- una constraint NOT NULL ahora, porque eso podría romper migrations
-- futuras si descubrimos algún caso edge. Mantenemos invariant a nivel
-- aplicación: si el endpoint persiste un log, persiste user_id.

UPDATE extraction_log
  SET user_id = 'legacy-single-user'
  WHERE user_id IS NULL;

UPDATE error_log
  SET user_id = 'legacy-single-user'
  WHERE user_id IS NULL;
