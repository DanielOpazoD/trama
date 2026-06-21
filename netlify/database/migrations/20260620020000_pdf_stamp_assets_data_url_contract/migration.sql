-- Alinea las constraints DB de firmas/timbres con el parser del endpoint.
-- La migración inicial ya fue aplicada en deploy previews; por eso se ajusta
-- con ALTER TABLE en una migración nueva e inmutable.

ALTER TABLE pdf_stamp_assets
  DROP CONSTRAINT IF EXISTS pdf_stamp_assets_mime_type_check;

ALTER TABLE pdf_stamp_assets
  ADD CONSTRAINT pdf_stamp_assets_mime_type_check
  CHECK (LOWER(mime_type) IN ('image/png', 'image/jpeg'));

ALTER TABLE pdf_stamp_assets
  DROP CONSTRAINT IF EXISTS pdf_stamp_assets_src_mime_check;

ALTER TABLE pdf_stamp_assets
  ADD CONSTRAINT pdf_stamp_assets_src_mime_check
  CHECK (
    (
      LOWER(mime_type) = 'image/png'
      AND (
        LOWER(src) LIKE 'data:image/png;%'
        OR
        LOWER(src) LIKE 'data:image/png,%'
      )
    )
    OR
    (
      LOWER(mime_type) = 'image/jpeg'
      AND (
        LOWER(src) LIKE 'data:image/jpeg;%'
        OR
        LOWER(src) LIKE 'data:image/jpeg,%'
      )
    )
  );
