-- Compartir Momentos uno a uno.
--
-- `momentos.user_id` sigue siendo el dueño/subidor original. Los accesos
-- aceptados viven en `momento_access`; las invitaciones pendientes por correo
-- viven en `momento_share_invitations` hasta que el invitado acepta o rechaza.

CREATE TABLE IF NOT EXISTS momento_access (
  momento_id    UUID NOT NULL REFERENCES momentos(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  invited_by    TEXT NOT NULL REFERENCES users(id),
  invitation_id UUID,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  PRIMARY KEY (momento_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_momento_access_user_live
  ON momento_access(user_id, momento_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_momento_access_momento_live
  ON momento_access(momento_id, user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS momento_share_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  momento_id      UUID NOT NULL REFERENCES momentos(id),
  inviter_user_id TEXT NOT NULL REFERENCES users(id),
  invitee_email   TEXT NOT NULL,
  invitee_user_id TEXT REFERENCES users(id),
  role            TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_momento_share_invitations_invitee_pending
  ON momento_share_invitations(lower(invitee_email), created_at DESC)
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_momento_share_invitations_momento_live
  ON momento_share_invitations(momento_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_momento_share_invitations_pending_unique
  ON momento_share_invitations(momento_id, lower(invitee_email))
  WHERE status = 'pending' AND deleted_at IS NULL;

ALTER TABLE momento_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE momento_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momento_access_isolation ON momento_access;
CREATE POLICY momento_access_isolation ON momento_access
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invited_by = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invited_by = NULLIF(current_setting('app.current_user_id', true), '')
  );

ALTER TABLE momento_share_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE momento_share_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momento_share_invitations_isolation ON momento_share_invitations;
CREATE POLICY momento_share_invitations_isolation ON momento_share_invitations
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR inviter_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invitee_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR inviter_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invitee_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
