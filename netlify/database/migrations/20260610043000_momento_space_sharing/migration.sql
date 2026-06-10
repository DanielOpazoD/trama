CREATE TABLE IF NOT EXISTS momento_space_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS momento_space_invitations_pending_unique
  ON momento_space_invitations (inviter_user_id, lower(invitee_email))
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS momento_space_invitations_invitee_email_idx
  ON momento_space_invitations (lower(invitee_email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS momento_space_invitations_inviter_idx
  ON momento_space_invitations (inviter_user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS momento_space_access (
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES momento_space_invitations(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (owner_user_id, member_user_id),
  CHECK (owner_user_id <> member_user_id)
);

CREATE INDEX IF NOT EXISTS momento_space_access_member_idx
  ON momento_space_access (member_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS momento_space_access_owner_idx
  ON momento_space_access (owner_user_id)
  WHERE deleted_at IS NULL;

ALTER TABLE momento_space_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE momento_space_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY momento_space_invitations_select_related
  ON momento_space_invitations
  FOR SELECT
  USING (
    inviter_user_id = current_setting('app.current_user_id', true)
    OR invitee_user_id = current_setting('app.current_user_id', true)
    OR lower(invitee_email) = lower(current_setting('app.current_user_email', true))
    OR current_setting('app.rls_bypass', true) = 'on'
  );

CREATE POLICY momento_space_invitations_insert_self
  ON momento_space_invitations
  FOR INSERT
  WITH CHECK (
    inviter_user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.rls_bypass', true) = 'on'
  );

CREATE POLICY momento_space_invitations_update_related
  ON momento_space_invitations
  FOR UPDATE
  USING (
    inviter_user_id = current_setting('app.current_user_id', true)
    OR invitee_user_id = current_setting('app.current_user_id', true)
    OR lower(invitee_email) = lower(current_setting('app.current_user_email', true))
    OR current_setting('app.rls_bypass', true) = 'on'
  )
  WITH CHECK (
    inviter_user_id = current_setting('app.current_user_id', true)
    OR invitee_user_id = current_setting('app.current_user_id', true)
    OR lower(invitee_email) = lower(current_setting('app.current_user_email', true))
    OR current_setting('app.rls_bypass', true) = 'on'
  );

CREATE POLICY momento_space_access_select_member_or_owner
  ON momento_space_access
  FOR SELECT
  USING (
    owner_user_id = current_setting('app.current_user_id', true)
    OR member_user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.rls_bypass', true) = 'on'
  );

CREATE POLICY momento_space_access_insert_related
  ON momento_space_access
  FOR INSERT
  WITH CHECK (
    owner_user_id = current_setting('app.current_user_id', true)
    OR member_user_id = current_setting('app.current_user_id', true)
    OR invited_by = current_setting('app.current_user_id', true)
    OR current_setting('app.rls_bypass', true) = 'on'
  );

CREATE POLICY momento_space_access_update_related
  ON momento_space_access
  FOR UPDATE
  USING (
    owner_user_id = current_setting('app.current_user_id', true)
    OR member_user_id = current_setting('app.current_user_id', true)
    OR invited_by = current_setting('app.current_user_id', true)
    OR current_setting('app.rls_bypass', true) = 'on'
  )
  WITH CHECK (
    owner_user_id = current_setting('app.current_user_id', true)
    OR member_user_id = current_setting('app.current_user_id', true)
    OR invited_by = current_setting('app.current_user_id', true)
    OR current_setting('app.rls_bypass', true) = 'on'
  );
