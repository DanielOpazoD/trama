import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { disconnectX, getStoredTokens } from './_lib/x/index.js'

type BookmarkCountRow = { c: number }

/**
 * GET  /api/x/status  → estado de conexión + conteo de bookmarks guardados.
 * DELETE /api/x/status → desconecta (borra los tokens; los bookmarks quedan).
 */
export default withObservability(
  'x-status',
  async (req: Request, _ctx: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    if (req.method === 'DELETE') {
      await disconnectX(sql, userId)
      return Response.json({ ok: true })
    }
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    const tokens = await getStoredTokens(sql, userId)
    if (!tokens) return Response.json({ connected: false })

    const countRows = await sqlTyped<BookmarkCountRow>(sql`
      SELECT COUNT(*)::int AS c FROM x_bookmarks
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `)

    return Response.json({
      connected: true,
      username: tokens.username,
      xUserId: tokens.x_user_id,
      lastSyncedAt: tokens.last_synced_at,
      counts: { totalBookmarks: countRows[0]?.c ?? 0 },
    })
  },
)

export const config: Config = {
  path: '/api/x/status',
}
