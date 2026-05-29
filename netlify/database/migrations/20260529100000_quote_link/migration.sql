-- ρ-citas: hipervínculo opcional asociado a una cita. Permite enlazar la
-- fuente en línea (artículo, video, post, página del libro en una tienda…).
-- Nullable; las citas existentes quedan con link = NULL.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS link text NULL;
