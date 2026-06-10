import type { Config, Context } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { runWithSystemRls } from './_lib/user-rls.js'

const Role = z.enum(['viewer', 'editor'])

const CreateInvitationBody = z.object({
  momentoId: z.string().uuid(),
  email: z.string().email(),
  role: Role.default('viewer'),
})

const RespondInvitationBody = z.object({
  action: z.enum(['accept', 'reject']),
})

type InvitationRow = {
  id: string
  momento_id: string
  inviter_user_id: string
  inviter_display_name: string | null
  inviter_email: string | null
  invitee_email: string
  invitee_user_id: string | null
  role: 'viewer' | 'editor'
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  responded_at: string | null
  created_at: string
  updated_at: string
  momento_kind: string
  momento_captured_at: string
  momento_note: string | null
}

type OwnedMomentoRow = { id: string }
type UserEmailRow = { email: string | null }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function resolveUserEmail(
  sql: ReturnType<typeof getSql>,
  userId: string,
  authEmail: string | undefined,
): Promise<string | null> {
  if (authEmail) return normalizeEmail(authEmail)
  const rows = await runWithSystemRls(() =>
    sqlTyped<UserEmailRow>(sql`
    SELECT email
    FROM users
    WHERE id = ${userId}
  `),
  )
  const email = rows[0]?.email
  return email ? normalizeEmail(email) : null
}

function invitationFromRow(row: InvitationRow) {
  return {
    id: row.id,
    momentoId: row.momento_id,
    inviterUserId: row.inviter_user_id,
    inviterDisplayName: row.inviter_display_name ?? undefined,
    inviterEmail: row.inviter_email ?? undefined,
    inviteeEmail: row.invitee_email,
    inviteeUserId: row.invitee_user_id ?? undefined,
    role: row.role,
    status: row.status,
    respondedAt: row.responded_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    momento: {
      kind: row.momento_kind,
      capturedAt: row.momento_captured_at,
      note: row.momento_note ?? undefined,
    },
  }
}

export default withObservability(
  'momentos-share-invitations',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const invitationId = context.params.id

    if (req.method === 'GET' && !invitationId) {
      const email = await resolveUserEmail(sql, userId, authedUser.email)
      if (!email) return Response.json({ items: [] })
      const rows = await runWithSystemRls(() =>
        sqlTyped<InvitationRow>(sql`
        SELECT i.id, i.momento_id, i.inviter_user_id,
               inviter.display_name AS inviter_display_name,
               inviter.email AS inviter_email,
               i.invitee_email, i.invitee_user_id, i.role, i.status,
               i.responded_at, i.created_at, i.updated_at,
               m.kind AS momento_kind,
               m.captured_at AS momento_captured_at,
               m.note AS momento_note
        FROM momento_share_invitations i
        JOIN momentos m ON m.id = i.momento_id
        LEFT JOIN users inviter ON inviter.id = i.inviter_user_id
        WHERE lower(i.invitee_email) = ${email}
          AND i.status = 'pending'
          AND i.deleted_at IS NULL
          AND m.deleted_at IS NULL
        ORDER BY i.created_at DESC
      `),
      )
      return Response.json({ items: rows.map(invitationFromRow) })
    }

    if (req.method === 'POST' && !invitationId) {
      const parsed = await parseJsonBody(req, CreateInvitationBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)

      const email = normalizeEmail(parsed.data.email)
      const inviterEmail = await resolveUserEmail(sql, userId, authedUser.email)
      if (inviterEmail && email === inviterEmail) {
        return ApiErrors.validation(requestId, 'No puedes invitarte a ti mismo')
      }

      const owned = await runWithSystemRls(() =>
        sqlTyped<OwnedMomentoRow>(sql`
        SELECT id
        FROM momentos
        WHERE id = ${parsed.data.momentoId}
          AND user_id = ${userId}
          AND deleted_at IS NULL
      `),
      )
      if (!owned[0]) return ApiErrors.notFound(requestId, 'Momento no encontrado')

      const rows = await runWithSystemRls(() =>
        sqlTyped<InvitationRow>(sql`
        WITH upserted AS (
          INSERT INTO momento_share_invitations (
            momento_id, inviter_user_id, invitee_email, role
          )
          VALUES (
            ${parsed.data.momentoId},
            ${userId},
            ${email},
            ${parsed.data.role}
          )
          ON CONFLICT (momento_id, (lower(invitee_email)))
            WHERE status = 'pending' AND deleted_at IS NULL
          DO UPDATE SET
            role = EXCLUDED.role,
            updated_at = NOW()
          RETURNING *
        )
        SELECT upserted.id, upserted.momento_id, upserted.inviter_user_id,
               inviter.display_name AS inviter_display_name,
               inviter.email AS inviter_email,
               upserted.invitee_email, upserted.invitee_user_id,
               upserted.role, upserted.status,
               upserted.responded_at, upserted.created_at, upserted.updated_at,
               m.kind AS momento_kind,
               m.captured_at AS momento_captured_at,
               m.note AS momento_note
        FROM upserted
        JOIN momentos m ON m.id = upserted.momento_id
        JOIN users inviter ON inviter.id = upserted.inviter_user_id
      `),
      )
      const row = rows[0]
      if (!row) return ApiErrors.internal(requestId, 'No se pudo crear la invitación')
      return Response.json(invitationFromRow(row), { status: 201 })
    }

    if (req.method === 'PATCH' && invitationId) {
      const parsed = await parseJsonBody(req, RespondInvitationBody, requestId)
      if (!parsed.ok) return parsed.response
      const email = await resolveUserEmail(sql, userId, authedUser.email)
      if (!email) {
        return ApiErrors.validation(
          requestId,
          'Tu sesión no expone correo para reclamar esta invitación',
        )
      }
      await ensureUserRow(sql, authedUser)

      if (parsed.data.action === 'reject') {
        const rejected = await runWithSystemRls(() =>
          sqlTyped<InvitationRow>(sql`
          WITH inv AS (
            SELECT *
            FROM momento_share_invitations
            WHERE id = ${invitationId}
              AND lower(invitee_email) = ${email}
              AND status = 'pending'
              AND deleted_at IS NULL
          ),
          upd AS (
            UPDATE momento_share_invitations i
            SET status = 'rejected',
                invitee_user_id = ${userId},
                responded_at = NOW(),
                updated_at = NOW()
            FROM inv
            WHERE i.id = inv.id
            RETURNING i.*
          )
          SELECT upd.id, upd.momento_id, upd.inviter_user_id,
                 inviter.display_name AS inviter_display_name,
                 inviter.email AS inviter_email,
                 upd.invitee_email, upd.invitee_user_id, upd.role, upd.status,
                 upd.responded_at, upd.created_at, upd.updated_at,
                 m.kind AS momento_kind,
                 m.captured_at AS momento_captured_at,
                 m.note AS momento_note
          FROM upd
          JOIN momentos m ON m.id = upd.momento_id
          LEFT JOIN users inviter ON inviter.id = upd.inviter_user_id
        `),
        )
        const row = rejected[0]
        if (!row) return ApiErrors.notFound(requestId, 'Invitación no encontrada')
        return Response.json(invitationFromRow(row))
      }

      const accepted = await runWithSystemRls(() =>
        sqlTyped<InvitationRow>(sql`
        WITH inv AS (
          SELECT *
          FROM momento_share_invitations
          WHERE id = ${invitationId}
            AND lower(invitee_email) = ${email}
            AND status = 'pending'
            AND deleted_at IS NULL
        ),
        grant_access AS (
          INSERT INTO momento_access (
            momento_id, user_id, role, invited_by, invitation_id
          )
          SELECT inv.momento_id, ${userId}, inv.role, inv.inviter_user_id, inv.id
          FROM inv
          JOIN momentos m ON m.id = inv.momento_id AND m.deleted_at IS NULL
          ON CONFLICT (momento_id, user_id) DO UPDATE
          SET role = EXCLUDED.role,
              invited_by = EXCLUDED.invited_by,
              invitation_id = EXCLUDED.invitation_id,
              accepted_at = NOW(),
              updated_at = NOW(),
              deleted_at = NULL
          RETURNING 1
        ),
        upd AS (
          UPDATE momento_share_invitations i
          SET status = 'accepted',
              invitee_user_id = ${userId},
              responded_at = NOW(),
              updated_at = NOW()
          FROM inv
          WHERE i.id = inv.id
            AND EXISTS (SELECT 1 FROM grant_access)
          RETURNING i.*
        )
        SELECT upd.id, upd.momento_id, upd.inviter_user_id,
               inviter.display_name AS inviter_display_name,
               inviter.email AS inviter_email,
               upd.invitee_email, upd.invitee_user_id, upd.role, upd.status,
               upd.responded_at, upd.created_at, upd.updated_at,
               m.kind AS momento_kind,
               m.captured_at AS momento_captured_at,
               m.note AS momento_note
        FROM upd
        JOIN momentos m ON m.id = upd.momento_id
        LEFT JOIN users inviter ON inviter.id = upd.inviter_user_id
      `),
      )
      const row = accepted[0]
      if (!row) return ApiErrors.notFound(requestId, 'Invitación no encontrada')
      return Response.json(invitationFromRow(row))
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/momentos-share-invitations', '/api/momentos-share-invitations/:id'],
}
