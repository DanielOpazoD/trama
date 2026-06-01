-- Privacy foundation: Row Level Security for every table that stores user data.
--
-- Runtime functions must set `app.current_user_id` inside the same Neon HTTP
-- transaction as protected queries:
--   SELECT set_config('app.current_user_id', '<clerk-or-legacy-user-id>', true)
--
-- Without that transaction-local setting, policies evaluate to NULL/false and
-- the table behaves as if it has no visible rows for the caller.
DO $$
DECLARE
  private_table text;
  private_tables text[] := ARRAY[
    'entities',
    'relationships',
    'quotes',
    'momentos',
    'momento_entities',
    'notes',
    'tasks',
    'chat_threads',
    'chat_messages',
    'spotify_plays',
    'spotify_tokens',
    'x_tokens',
    'x_bookmarks',
    'extraction_log',
    'error_log',
    'ai_task_providers',
    'proactive_suggestions',
    'web_vitals_samples',
    'cronicas',
    'atlas_snapshots',
    'x_cronicas'
  ];
BEGIN
  FOREACH private_table IN ARRAY private_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', private_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', private_table);

    EXECUTE format('DROP POLICY IF EXISTS trama_user_isolation ON %I', private_table);
    EXECUTE format(
      $policy$
        CREATE POLICY trama_user_isolation ON %I
          USING (
            current_setting('app.rls_bypass', true) = 'system'
            OR
            user_id = NULLIF(current_setting('app.current_user_id', true), '')
          )
          WITH CHECK (
            current_setting('app.rls_bypass', true) = 'system'
            OR
            user_id = NULLIF(current_setting('app.current_user_id', true), '')
          )
      $policy$,
      private_table
    );
  END LOOP;
END $$;
