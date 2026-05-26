import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Chat threads CRUD.
 *
 * GET    /api/chat/threads          → list (active only, newest updated first)
 * POST   /api/chat/threads          → create (returns the new thread)
 * DELETE /api/chat/threads/:id      → soft delete (cascades to messages via FK + filter)
 */
export default withObservability(
  'chat-threads',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const { id: userId } = await getAuthedUser(req)
    const id = context.params.id

    if (req.method === 'GET') {
      type Row = {
        id: string
        title: string | null
        context: string | null
        created_at: string
        updated_at: string
        message_count: string
      }
      const rows = (await sql`
        SELECT t.id, t.title, t.context, t.created_at, t.updated_at,
               COUNT(m.id) AS message_count
        FROM chat_threads t
        LEFT JOIN chat_messages m ON m.thread_id = t.id
        WHERE t.deleted_at IS NULL AND t.user_id = ${userId}
        GROUP BY t.id
        ORDER BY t.updated_at DESC
        LIMIT 200
      `) as Row[]
      return Response.json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          context: r.context,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          messageCount: Number(r.message_count),
        })),
      )
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        title?: string
        context?: string
      }
      const title = body.title?.trim() || null
      const context = body.context?.trim() || null
      const rows = (await sql`
        INSERT INTO chat_threads (title, context, user_id)
        VALUES (${title}, ${context}, ${userId})
        RETURNING id, title, context, created_at, updated_at
      `) as Array<{
        id: string
        title: string | null
        context: string | null
        created_at: string
        updated_at: string
      }>
      const row = rows[0]
      return Response.json(
        {
          id: row.id,
          title: row.title,
          context: row.context,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          messageCount: 0,
        },
        { status: 201 },
      )
    }

    if (req.method === 'DELETE' && id) {
      await sql`UPDATE chat_threads SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}`
      return new Response(null, { status: 204 })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/chat/threads', '/api/chat/threads/:id'],
}
