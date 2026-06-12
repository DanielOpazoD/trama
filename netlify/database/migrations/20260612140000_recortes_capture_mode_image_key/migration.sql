-- Bloque B+: modos de captura + imágenes internas de la extensión.
--
-- capture_mode: cómo se capturó el recorte. 'citation' (selección, el
-- default histórico) | 'article' (artículo como objeto) | 'html' (página
-- como markdown) | 'region' (recorte visual de pantalla) | 'image' (imagen
-- de la web). Etiqueta la vista sin heurística. Filas viejas = NULL → la
-- app las interpreta como 'citation'.
--
-- image_key: ruta de blob AUTHED (store 'recortes-media') para capturas
-- internas (región, screenshots subidos). Distinto de image_url, que sigue
-- valiendo para imágenes externas (el menú "Guardar imagen" guarda la URL
-- http real del <img>). La vista prefiere image_key cuando está.
--
-- Aditiva, no toca 20260612000000_recortes (inmutable tras main).

ALTER TABLE recortes ADD COLUMN IF NOT EXISTS capture_mode TEXT;
ALTER TABLE recortes ADD COLUMN IF NOT EXISTS image_key TEXT;

ALTER TABLE recortes DROP CONSTRAINT IF EXISTS recortes_capture_mode_check;
ALTER TABLE recortes ADD CONSTRAINT recortes_capture_mode_check
  CHECK (
    capture_mode IS NULL
    OR capture_mode IN ('citation', 'article', 'html', 'region', 'image')
  );
