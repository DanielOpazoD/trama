-- Índices aditivos para que los listados calientes por usuario tengan un
-- contrato verificable en `check:query-plans`.
--
-- No reemplazan índices históricos más generales; cubren el patrón que hoy
-- repiten los endpoints: `deleted_at IS NULL`, `user_id = ?`, keyset/orden
-- estable por fecha + id.

CREATE INDEX IF NOT EXISTS idx_entities_user_created_id
  ON entities (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_user_pinned_created_id
  ON quotes (user_id, pinned_at DESC NULLS LAST, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_momentos_user_captured_id
  ON momentos (user_id, captured_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_momentos_user_kind_captured_id
  ON momentos (user_id, kind, captured_at DESC, id DESC)
  WHERE deleted_at IS NULL;
