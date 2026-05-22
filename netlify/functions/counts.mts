import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * Lightweight aggregate counts. Returns { entities, quotes, relationships }.
 *
 * The Sidebar (and any future "stat strip" surface) needs totals — but
 * loading the full lists just to count would defeat the point of
 * pagination at scale. Each count here is a cheap COUNT(*) over the soft-
 * delete predicate; Postgres handles 100k rows in milliseconds.
 */
export default withObservability('counts', async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const sql = getSql()
  type CountRow = { c: string }
  const [eRows, qRows, rRows] = await Promise.all([
    sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM relationships WHERE deleted_at IS NULL` as unknown as Promise<CountRow[]>,
  ])

  return Response.json({
    entities: Number(eRows[0]?.c ?? 0),
    quotes: Number(qRows[0]?.c ?? 0),
    relationships: Number(rRows[0]?.c ?? 0),
  })
})

export const config: Config = {
  path: '/api/counts',
}
