-- Library Uploads domain v1
--
-- Habilita el dominio 'library-uploads' en `storage_assets`: el manifest de
-- blobs de los archivos que el usuario sube DIRECTO a la Biblioteca (PR1 de
-- subida). Hasta ahora la Biblioteca solo UNÍA fuentes que ya tenían tabla
-- propia (adjuntos, recortes, fotos, PDFs); estas subidas no tienen tabla
-- nativa, así que `storage_assets` ES su fuente de verdad.
--
-- Solo amplía el CHECK del dominio (no mueve bytes, no toca columnas, no toca
-- RLS). Idempotente: DROP IF EXISTS + ADD con la lista completa de dominios.

ALTER TABLE storage_assets
  DROP CONSTRAINT IF EXISTS storage_assets_domain_check;

ALTER TABLE storage_assets
  ADD CONSTRAINT storage_assets_domain_check
    CHECK (
      domain IN (
        'notas-attachments',
        'momentos-media',
        'recortes-media',
        'pdf-studio-saved-pdfs',
        'pdf-stamp-assets',
        'library-uploads'
      )
    );
