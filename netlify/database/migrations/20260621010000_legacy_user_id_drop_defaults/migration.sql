-- Legacy Identity Cutover v1
--
-- La migración multi-user original agregó user_id con
-- DEFAULT 'legacy-single-user' para mantener compatibilidad durante el rollout.
-- En producción estricta, ese default ya no debe ser el camino normal: cada
-- handler debe resolver un usuario explícito y escribirlo. Quitar el default
-- hace que cualquier INSERT nuevo sin user_id falle ruidosamente en vez de
-- crear filas bajo el tenant histórico.
--
-- No toca datos existentes ni elimina la row legacy; legacy-single-user queda
-- como compatibilidad histórica para datos/blobs pre-Clerk.

ALTER TABLE atlas_snapshots ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE chat_messages ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE chat_threads ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE cronicas ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE entities ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE momento_entities ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE momentos ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE month_notes ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE notas_attachments ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE notes ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE pdf_studio_saved_pdfs ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE proactive_suggestions ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE prompts ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE quotes ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE relationships ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE secrets ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE spotify_plays ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE user_prefs ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE x_bookmarks ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE x_cronicas ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE x_tokens ALTER COLUMN user_id DROP DEFAULT;
