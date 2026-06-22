-- Storage Assets R2 provider v1
--
-- Habilita el provider 'r2' (Cloudflare R2, S3-compatible) en `storage_assets`.
-- Lo usan los archivos grandes (>4 MB) que el usuario sube DIRECTO a R2 desde el
-- navegador (subida presignada de la Biblioteca): la función de Netlify NO ve el
-- byte stream (topa ~6 MB), así que el cliente PUTea directo al bucket y luego
-- llama a /api/library-uploads-complete, que registra esta fila con provider='r2'
-- y domain='library-uploads'. Los archivos chicos siguen con 'netlify-blobs'.
--
-- Solo amplía el CHECK del provider (no mueve bytes, no toca columnas, no toca
-- RLS). Idempotente: DROP IF EXISTS + ADD con la lista completa de providers.

ALTER TABLE storage_assets
  DROP CONSTRAINT IF EXISTS storage_assets_provider_check;

ALTER TABLE storage_assets
  ADD CONSTRAINT storage_assets_provider_check
    CHECK (
      provider IN (
        'netlify-blobs',
        'postgres-data-url',
        'r2'
      )
    );
