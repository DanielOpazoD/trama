import type { Config, Context } from '@netlify/functions'
import { getAuthedUser } from './_lib/auth.js'
import { ApiErrors } from './_lib/api-error.js'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

// Corre BAJO el contexto RLS del usuario (entrado por getAuthedUser y aplicado
// por el cliente scopeado de db.ts): las policies de momento_space_access ya
// permiten owner/member, y `users` es catálogo compartido sin RLS. Sin bypass.

type AccessRow = {
  user_id: string
  display_name: string | null
  email: string | null
  role: 'viewer' | 'editor'
  accepted_at: string
}

type RevokeRow = { revoked: boolean }

function accessFromRow(row: AccessRow) {
  return {
    userId: row.user_id,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    role: row.role,
    acceptedAt: row.accepted_at,
  }
}

export default withObservability(
  'momentos-share-access',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const otherUserId = context.params.userId

    if (req.method === 'GET' && !otherUserId) {
      const rows = await sqlTyped<AccessRow>(sql`
        SELECT DISTINCT ON (other_user.id)
               other_user.id AS user_id,
               other_user.display_name,
               other_user.email,
               a.role,
               a.accepted_at
        FROM momento_space_access a
        JOIN users other_user
          ON other_user.id = CASE
            WHEN a.owner_user_id = ${userId} THEN a.member_user_id
            ELSE a.owner_user_id
          END
        WHERE a.deleted_at IS NULL
          AND (a.owner_user_id = ${userId} OR a.member_user_id = ${userId})
        ORDER BY other_user.id, a.accepted_at DESC
      `)
      return Response.json({ items: rows.map(accessFromRow) })
    }

    if (req.method === 'DELETE' && otherUserId) {
      if (otherUserId === userId) {
        return ApiErrors.validation(requestId, 'No puedes revocar tu propio acceso')
      }
      await ensureUserRow(sql, authedUser)
      const rows = await sqlTyped<RevokeRow>(sql`
        WITH revoked AS (
          UPDATE momento_space_access
          SET deleted_at = NOW(),
              updated_at = NOW()
          WHERE deleted_at IS NULL
            AND (
              (owner_user_id = ${userId} AND member_user_id = ${otherUserId})
              OR (member_user_id = ${userId} AND owner_user_id = ${otherUserId})
            )
          RETURNING 1
        )
        SELECT EXISTS (SELECT 1 FROM revoked) AS revoked
      `)
      if (!rows[0]?.revoked) {
        return ApiErrors.notFound(requestId, 'Acceso compartido no encontrado')
      }
      return Response.json({ revoked: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/momentos-share-access', '/api/momentos-share-access/:userId'],
}
