import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { listBookmarks, type StoredBookmark } from './_lib/x/index.js'

/**
 * GET /api/x/bookmarks?limit=&cursor= — lista los bookmarks guardados del
 * usuario (los que trajo /api/x/sync), más recientes primero. Paginación por
 * cursor sobre `captured_at`. El SQL per-usuario vive en `_lib/x/sync.ts`
 * (filtra por user_id) — este handler solo transforma a camelCase.
 */
const PAGE_SIZE = 50
const MAX_PAGE = 100

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
  }
}

export default withObservability(
  'x-bookmarks',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    const url = new URL(req.url)
    const rawLimit = Number(url.searchParams.get('limit'))
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE) : PAGE_SIZE
    const cursor = url.searchParams.get('cursor')

    const rows = await listBookmarks(sql, userId, limit + 1, cursor)
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? (page[page.length - 1]?.captured_at ?? null) : null

    return Response.json({ items: page.map(toCamel), nextCursor })
  },
)

export const config: Config = {
  path: '/api/x/bookmarks',
}
