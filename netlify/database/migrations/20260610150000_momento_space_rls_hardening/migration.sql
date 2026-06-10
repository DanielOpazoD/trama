-- Endurecimiento RLS de las tablas de compartir Momentos (P0 de la auditoría
-- 2026-06-10). La migración 20260610043000 dejó tres grietas que volvían sus
-- policies decorativas:
--
--   1. Sin FORCE ROW LEVEL SECURITY: el rol dueño de las tablas (el que usa
--      Neon HTTP) NO está sujeto a las policies — RLS apagado en la práctica.
--   2. Bypass con token equivocado: las policies comparaban
--      app.rls_bypass = 'on', pero runWithSystemRls() setea 'system' (el token
--      canónico de trama_user_isolation). Ni el bypass funcionaba.
--   3. app.current_user_email no se seteaba en ningún punto del código (eso se
--      arregla en _lib/user-rls.ts + _lib/auth.ts en el mismo PR). Acá las
--      policies además envuelven el setting con NULLIF(…, '') para que el ''
--      con que el runtime inicializa la variable nunca matchee un email real.
--
-- Las policies se DROPean y recrean completas (CREATE POLICY no tiene IF NOT
-- EXISTS; DROP IF EXISTS + CREATE deja la migración re-ejecutable).

ALTER TABLE momento_space_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE momento_space_access FORCE ROW LEVEL SECURITY;

-- ── momento_space_invitations ───────────────────────────────────────────────

DROP POLICY IF EXISTS momento_space_invitations_select_related ON momento_space_invitations;
CREATE POLICY momento_space_invitations_select_related
  ON momento_space_invitations
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR inviter_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invitee_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR lower(invitee_email) = lower(NULLIF(current_setting('app.current_user_email', true), ''))
  );

DROP POLICY IF EXISTS momento_space_invitations_insert_self ON momento_space_invitations;
CREATE POLICY momento_space_invitations_insert_self
  ON momento_space_invitations
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR inviter_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

DROP POLICY IF EXISTS momento_space_invitations_update_related ON momento_space_invitations;
CREATE POLICY momento_space_invitations_update_related
  ON momento_space_invitations
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR inviter_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invitee_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR lower(invitee_email) = lower(NULLIF(current_setting('app.current_user_email', true), ''))
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR inviter_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR invitee_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR lower(invitee_email) = lower(NULLIF(current_setting('app.current_user_email', true), ''))
  );

-- ── momento_space_access ────────────────────────────────────────────────────

DROP POLICY IF EXISTS momento_space_access_select_member_or_owner ON momento_space_access;
CREATE POLICY momento_space_access_select_member_or_owner
  ON momento_space_access
  FOR SELECT
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

DROP POLICY IF EXISTS momento_space_access_insert_related ON momento_space_access;
CREATE POLICY momento_space_access_insert_related
  ON momento_space_access
  FOR INSERT
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );

DROP POLICY IF EXISTS momento_space_access_update_related ON momento_space_access;
CREATE POLICY momento_space_access_update_related
  ON momento_space_access
  FOR UPDATE
  USING (
    current_setting('app.rls_bypass', true) = 'system'
    OR owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'system'
    OR owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')
    OR member_user_id = NULLIF(current_setting('app.current_user_id', true), '')
  );
