-- Notas: título OPCIONAL (corto) además del contenido markdown.
--
-- Nullable y sin default: la captura rápida sin título y todas las notas
-- existentes siguen igual (title = NULL). No necesita índice — no es clave de
-- orden ni de filtro (el listado sigue ordenando por pinned/created_at); la
-- búsqueda ?q lo cubre con un ILIKE junto al contenido.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title text NULL;
