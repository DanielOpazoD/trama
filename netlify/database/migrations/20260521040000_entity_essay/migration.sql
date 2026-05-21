-- Long-form note on an entity.
--
-- `description` is a one-liner (max 15 words by convention). `essay` is the
-- place for a longer text — a paragraph, a few notes, a tiny piece of writing
-- the user wants to keep next to the entity. Markdown is allowed; the UI
-- renders it as plain prose with light formatting (paragraph breaks, italics).

ALTER TABLE entities ADD COLUMN IF NOT EXISTS essay TEXT;
