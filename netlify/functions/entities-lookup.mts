import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Resolver liviano para entidades, pensado para los call sites que
 * actualmente cargan la lista completa en memoria solo para hacer
 *   entities.find(e => e.name.toLowerCase() === '...')
 *   entities.find(e => e.id === '...')
 *
 * A 100k filas eso es inviable. Estos endpoints lo hacen del lado del
 * servidor con un golpe de índice.
 *
 * GET /api/entities/lookup
 *   ?name=...    → match exacto case-insensitive
 *   ?prefix=...  → top-10 que empiezan con ese prefijo (trigram + LIKE)
 *   ?ids=a,b,c   → bulk fetch por ids (hasta 200)
 *
 * Responses son siempre arrays de entidades en la misma shape que
 * /api/entities devuelve. Si nada matchea, [] (no 404).
 */
export default withObservability('entities-lookup', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const url = new URL(req.url)
  const name = url.searchParams.get('name')
  const prefix = url.searchParams.get('prefix')
  const idsRaw = url.searchParams.get('ids')

  if (!name && !prefix && !idsRaw) {
    return ApiErrors.validation(requestId, 'Falta uno de: name, prefix, ids')
  }

  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()

  let rows: unknown[] = []
  if (name) {
    // Case-insensitive exact match. Uses idx_entities_name_trgm for the
    // ILIKE, but at scale a btree on lower(name) would be better — we
    // can add that index when name lookups become hot.
    rows = (await sql`
      SELECT id, type, name, year, description, essay,
             position_x, position_y, origin, spotify_url,
             created_at, updated_at
      FROM entities
      WHERE deleted_at IS NULL
        AND user_id = ${userId}
        AND lower(name) = lower(${name})
      LIMIT 5
    `) as unknown[]
  } else if (prefix) {
    const trimmedPrefix = prefix.trim()
    if (trimmedPrefix.length < 1) {
      return Response.json([])
    }
    rows = (await sql`
      SELECT id, type, name, year, description, essay,
             position_x, position_y, origin, spotify_url,
             created_at, updated_at,
             similarity(name, ${trimmedPrefix}) AS sim
      FROM entities
      WHERE deleted_at IS NULL
        AND user_id = ${userId}
        AND (name ILIKE ${trimmedPrefix + '%'} OR name % ${trimmedPrefix})
      ORDER BY sim DESC, name ASC
      LIMIT 10
    `) as unknown[]
  } else if (idsRaw) {
    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200)
    if (ids.length === 0) return Response.json([])
    rows = (await sql`
      SELECT id, type, name, year, description, essay,
             position_x, position_y, origin, spotify_url,
             created_at, updated_at
      FROM entities
      WHERE deleted_at IS NULL
        AND user_id = ${userId}
        AND id = ANY(${ids}::uuid[])
    `) as unknown[]
  }

  // Mantener la shape snake_case porque el resto de /api/entities también
  // devuelve raw rows; el cliente las transforma vía entityFromRow.
  return Response.json(rows)
})

export const config: Config = {
  // Hyphenated path avoids any chance of colliding with /api/entities/:id
  // registered in entities.mts. Static-vs-dynamic precedence in Netlify is
  // documented but a separate path is unambiguous.
  path: '/api/entities-lookup',
}
