-- Proactive AI suggestions inbox.
--
-- Instead of the user always asking the AI for help, the AI can do a sweep
-- of the trama on demand and leave a bundle of suggestions here for the user
-- to review at their own pace. Each suggestion is a single actionable item
-- with a kind and a typed payload.
--
-- Kinds (extensible — validated in code, not in SQL):
--   'relationship'      → a new directed link between two existing entities
--   'reclassification'  → change an entity's type
--   'description'       → fill in a missing one-liner for an entity
--   'essay'             → propose a longer essay for an entity
--   'spotify-import'    → bring an artist/track from Escuchas into the trama
--
-- Status:
--   'pending'   → fresh, waiting for the user
--   'applied'   → user accepted; the change happened via the normal endpoints
--   'dismissed' → user said no
--
-- We don't soft-delete: dismissed/applied rows stay around for history.

CREATE TABLE proactive_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT NOT NULL,
  payload           JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'applied', 'dismissed')),
  provider          TEXT,
  model             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_at TIMESTAMPTZ
);

CREATE INDEX idx_proactive_suggestions_pending
  ON proactive_suggestions(created_at DESC) WHERE status = 'pending';
