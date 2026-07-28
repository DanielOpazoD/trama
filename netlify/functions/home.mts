import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

const HOME_LIMIT = 80

export default withObservability('home', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()

  const [entities, quotes, relationships, countsRows] = await Promise.all([
    sql`
      SELECT id, type, name, year, description, position_x, position_y,
             origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
      FROM entities
      WHERE deleted_at IS NULL AND user_id = ${userId}
      ORDER BY created_at DESC, id DESC
      LIMIT ${HOME_LIMIT}
    `,
    sql`
      SELECT id, entity_id, text, source, context, link, user_reflection,
             ai_reflection, ai_reflection_provider, ai_reflection_model,
             ai_reflection_at, linked_quote_ids, pinned_at, resonance,
             origin, created_at, updated_at
      FROM quotes
      WHERE deleted_at IS NULL AND user_id = ${userId}
      ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
      LIMIT ${HOME_LIMIT}
    `,
    sql`
      SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
      FROM relationships
      WHERE deleted_at IS NULL AND user_id = ${userId}
      ORDER BY created_at DESC, id DESC
      LIMIT ${HOME_LIMIT}
    `,
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM entities WHERE deleted_at IS NULL AND user_id = ${userId}) AS entities,
        (SELECT COUNT(*)::int FROM quotes WHERE deleted_at IS NULL AND user_id = ${userId}) AS quotes,
        (SELECT COUNT(*)::int FROM relationships WHERE deleted_at IS NULL AND user_id = ${userId}) AS relationships
    `,
  ])

  return Response.json({
    entities,
    quotes,
    relationships,
    counts: (
      countsRows as Array<{ entities: number; quotes: number; relationships: number }>
    )[0] ?? { entities: 0, quotes: 0, relationships: 0 },
  })
})

export const config: Config = {
  path: '/api/home',
}
