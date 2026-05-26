import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Lightweight aggregate counts. Returns { entities, quotes, relationships }.
 *
 * The Sidebar (and any future "stat strip" surface) needs totals — but
 * loading the full lists just to count would defeat the point of
 * pagination at scale. Each count here is a cheap COUNT(*) over the soft-
 * delete predicate; Postgres handles 100k rows in milliseconds.
 */
export default withObservability('counts', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const sql = getSql()
  const { id: userId } = await getAuthedUser(req)
  type CountRow = { c: string }
  // ρ-consistency: incluir momentos para que el sidebar muestre count
  // coherente con las demás secciones (antes Momentos era el único item
  // sin badge). Cuenta sólo no-borrados — los `deleted_at IS NULL`
  // garantizan el patrón soft-delete del proyecto.
  const [eRows, qRows, rRows, mRows] = await Promise.all([
    sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL AND user_id = ${userId}` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL AND user_id = ${userId}` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM relationships WHERE deleted_at IS NULL AND user_id = ${userId}` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM momentos WHERE deleted_at IS NULL AND user_id = ${userId}` as unknown as Promise<CountRow[]>,
  ])

  return Response.json({
    entities: Number(eRows[0]?.c ?? 0),
    quotes: Number(qRows[0]?.c ?? 0),
    relationships: Number(rRows[0]?.c ?? 0),
    momentos: Number(mRows[0]?.c ?? 0),
  })
})

export const config: Config = {
  path: '/api/counts',
}
