CREATE TABLE IF NOT EXISTS momento_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  momento_id UUID NOT NULL REFERENCES momentos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (
    char_length(trim(body)) BETWEEN 1 AND 500
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS momento_comments_momento_idx
  ON momento_comments (momento_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS momento_comments_user_idx
  ON momento_comments (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS momento_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  momento_id UUID NOT NULL REFERENCES momentos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'heart' CHECK (reaction IN ('heart')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS momento_reactions_unique
  ON momento_reactions (momento_id, user_id, reaction);

CREATE INDEX IF NOT EXISTS momento_reactions_momento_idx
  ON momento_reactions (momento_id, reaction)
  WHERE deleted_at IS NULL;

ALTER TABLE momento_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE momento_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE momento_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE momento_reactions FORCE ROW LEVEL SECURITY;

CREATE POLICY momento_comments_select_readable
  ON momento_comments
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR EXISTS (
      SELECT 1
      FROM momentos m
      LEFT JOIN momento_space_access msa
        ON msa.owner_user_id = m.user_id
       AND msa.member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
       AND msa.deleted_at IS NULL
      WHERE m.id = momento_comments.momento_id
        AND m.deleted_at IS NULL
        AND (
          m.user_id = NULLIF(current_setting('app.current_user_id', true), '')
          OR msa.member_user_id IS NOT NULL
        )
    )
  );

CREATE POLICY momento_comments_insert_readable_self
  ON momento_comments
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR (
      user_id = NULLIF(current_setting('app.current_user_id', true), '')
      AND EXISTS (
        SELECT 1
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
         AND msa.deleted_at IS NULL
        WHERE m.id = momento_comments.momento_id
          AND m.deleted_at IS NULL
          AND (
            m.user_id = NULLIF(current_setting('app.current_user_id', true), '')
            OR msa.member_user_id IS NOT NULL
          )
      )
    )
  );

CREATE POLICY momento_comments_update_author_or_owner
  ON momento_comments
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR EXISTS (
      SELECT 1
      FROM momentos m
      WHERE m.id = momento_comments.momento_id
        AND m.deleted_at IS NULL
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR EXISTS (
      SELECT 1
      FROM momentos m
      WHERE m.id = momento_comments.momento_id
        AND m.deleted_at IS NULL
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')
    )
  );

CREATE POLICY momento_reactions_select_readable
  ON momento_reactions
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR EXISTS (
      SELECT 1
      FROM momentos m
      LEFT JOIN momento_space_access msa
        ON msa.owner_user_id = m.user_id
       AND msa.member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
       AND msa.deleted_at IS NULL
      WHERE m.id = momento_reactions.momento_id
        AND m.deleted_at IS NULL
        AND (
          m.user_id = NULLIF(current_setting('app.current_user_id', true), '')
          OR msa.member_user_id IS NOT NULL
        )
    )
  );

CREATE POLICY momento_reactions_insert_readable_self
  ON momento_reactions
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR (
      user_id = NULLIF(current_setting('app.current_user_id', true), '')
      AND EXISTS (
        SELECT 1
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
         AND msa.deleted_at IS NULL
        WHERE m.id = momento_reactions.momento_id
          AND m.deleted_at IS NULL
          AND (
            m.user_id = NULLIF(current_setting('app.current_user_id', true), '')
            OR msa.member_user_id IS NOT NULL
          )
      )
    )
  );

CREATE POLICY momento_reactions_update_self
  ON momento_reactions
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
