import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { searchWikipedia, type WikiResult } from './_lib/wikipedia.js'
import { logEvent } from './_lib/observability.js'

/**
 * GET /api/wikipedia-suggest — para las entidades que NO tienen wikipedia_url,
 * propone el mejor artículo de Wikipedia. Devuelve sugerencias REVISABLES: el
 * usuario acepta o rechaza cada una (el match por nombre es ambiguo, no se
 * asigna nada solo).
 *
 * Acotado a un lote (BATCH) por corrida — cada entidad es un fetch a Wikipedia,
 * secuencial para ser amable con su API. `remaining` avisa si quedan más.
 */
type EntityRow = { id: string; name: string; type: string }
const BATCH = 25

export default withObservability(
  'wikipedia-suggest',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    const rows = await sqlTyped<EntityRow>(sql`
      SELECT id, name, type FROM entities
      WHERE deleted_at IS NULL AND user_id = ${userId} AND wikipedia_url IS NULL
      ORDER BY created_at DESC
      LIMIT ${BATCH + 1}
    `)
    const batch = rows.slice(0, BATCH)
    const remaining = rows.length > BATCH

    const suggestions: Array<{
      entityId: string
      entityName: string
      entityType: string
      match: WikiResult | null
    }> = []
    for (const e of batch) {
      let match: WikiResult | null = null
      try {
        const results = await searchWikipedia(e.name)
        match = results[0] ?? null
      } catch {
        // Una falla puntual no frena el lote — esa entidad queda sin sugerencia.
        match = null
      }
      suggestions.push({
        entityId: e.id,
        entityName: e.name,
        entityType: e.type,
        match,
      })
    }

    logEvent({ event: 'wikipedia_suggest', scanned: batch.length, remaining })
    return Response.json({ suggestions, remaining })
  },
)

export const config: Config = {
  path: '/api/wikipedia-suggest',
}
