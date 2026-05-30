import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { deleteBookmark, listBookmarks, type StoredBookmark } from './_lib/x/index.js'

/**
 * /api/x/bookmarks
 *   GET    → lista los bookmarks vivos (camelCase), ordenados por fecha del
 *            tweet. La vista los agrupa por año/mes y filtra por tema
 *            client-side; a escala personal traer todo (capado) es lo más
 *            simple. El SQL per-usuario vive en _lib/x/sync.ts.
 *   DELETE ?id=<id> → soft-delete (lo quita de Trama; no toca X).
 */
const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 5000

function toCamel(b: StoredBookmark) {
  return {
    id: b.id,
    tweetId: b.tweet_id,
    text: b.text,
    authorName: b.author_name,
    authorUsername: b.author_username,
    tweetCreatedAt: b.tweet_created_at,
    url: b.url,
    capturedAt: b.captured_at,
    topic: b.topic,
  }
}

export default withObservability(
  'x-bookmarks',
  async (req: Request, _ctx: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const url = new URL(req.url)

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return ApiErrors.validation(requestId, 'id requerido')
      const ok = await deleteBookmark(sql, userId, id)
      if (!ok) return ApiErrors.notFound(requestId, 'Bookmark no encontrado')
      return Response.json({ ok: true })
    }

    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    const rawLimit = Number(url.searchParams.get('limit'))
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : DEFAULT_LIMIT

    const rows = await listBookmarks(sql, userId, limit)
    return Response.json({ items: rows.map(toCamel) })
  },
)

export const config: Config = {
  path: '/api/x/bookmarks',
}
