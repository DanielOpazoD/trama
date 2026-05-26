import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'

/**
 * Subgraph endpoint: returns an entity + its N-hop neighborhood.
 *
 * GET /api/graph/neighbors?from=<uuid>&hops=2&limit=120
 *
 * Defaults: hops=1, limit=120. Both bounded so a 100k-entity trama never
 * answers with a giant payload — the UI explores by clicking "expand" on
 * nodes at the edge, growing the subgraph incrementally.
 *
 * Response:
 *   {
 *     from: { ...entity fields, hopDistance: 0 },
 *     entities: [{ ...entity fields, hopDistance }, ...],  // includes "from"
 *     relationships: [{ id, fromId, toId, type, notes }, ...]
 *   }
 *
 * Algorithm:
 *   1) Recursive CTE walks the relationship graph from `from`, depth ≤ hops.
 *   2) Take MIN(depth) per id to dedupe paths to the same node.
 *   3) Truncate to `limit` rows, preferring closer hops, then by relationship
 *      degree (popular nodes are more interesting to see expanded).
 *   4) Load entity rows for the kept ids and load all edges connecting any
 *      pair of them.
 */
export default withObservability('graph-neighbors', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const url = new URL(req.url)
  const fromId = url.searchParams.get('from')
  if (!fromId) {
    return ApiErrors.validation(requestId, 'Falta el parámetro "from"')
  }

  const hopsParam = url.searchParams.get('hops')
  const limitParam = url.searchParams.get('limit')
  const hops = Math.min(Math.max(Number.parseInt(hopsParam ?? '1', 10) || 1, 1), 3)
  const limit = Math.min(Math.max(Number.parseInt(limitParam ?? '120', 10) || 120, 1), 500)

  const sql = getSql()

  // 1) Verify the focal entity exists (and isn't soft-deleted).
  type EntityRow = {
    id: string
    type: string
    name: string
    year: number | null
    description: string | null
    essay: string | null
    position_x: number | null
    position_y: number | null
    origin: unknown
    spotify_url: string | null
    created_at: string
    updated_at: string
  }
  const focalRows = (await sql`
    SELECT id, type, name, year, description, essay, position_x, position_y,
           origin, spotify_url, created_at, updated_at
    FROM entities
    WHERE id = ${fromId} AND deleted_at IS NULL
  `) as EntityRow[]
  if (focalRows.length === 0) {
    return ApiErrors.notFound(requestId, 'Entidad no encontrada')
  }

  // 2) Walk the neighborhood up to `hops` and rank: closer first, then by
  // degree so popular nodes win when we truncate. The CTE returns (id, min
  // depth, degree) so the ORDER BY is meaningful.
  type WalkRow = { id: string; hop_distance: number; degree: string }
  const walkRows = (await sql`
    WITH RECURSIVE walk(id, depth) AS (
      SELECT id, 0
      FROM entities
      WHERE id = ${fromId} AND deleted_at IS NULL
      UNION
      SELECT
        CASE WHEN r.from_id = w.id THEN r.to_id ELSE r.from_id END,
        w.depth + 1
      FROM walk w
      JOIN relationships r ON (r.from_id = w.id OR r.to_id = w.id)
                          AND r.deleted_at IS NULL
      JOIN entities e ON e.id = (CASE WHEN r.from_id = w.id THEN r.to_id ELSE r.from_id END)
                     AND e.deleted_at IS NULL
      WHERE w.depth < ${hops}
    ),
    dedup AS (
      SELECT id, MIN(depth) AS depth FROM walk GROUP BY id
    )
    SELECT
      d.id,
      d.depth AS hop_distance,
      (
        SELECT COUNT(*)::text
        FROM relationships rr
        WHERE rr.deleted_at IS NULL
          AND (rr.from_id = d.id OR rr.to_id = d.id)
      ) AS degree
    FROM dedup d
    ORDER BY d.depth, (
      SELECT COUNT(*) FROM relationships rr
      WHERE rr.deleted_at IS NULL AND (rr.from_id = d.id OR rr.to_id = d.id)
    ) DESC
    LIMIT ${limit}
  `) as WalkRow[]

  const idsInWindow = walkRows.map((w) => w.id)
  const hopById = new Map(walkRows.map((w) => [w.id, w.hop_distance]))

  // 3) Fetch full rows for entities in the window.
  const entityRows =
    idsInWindow.length === 0
      ? []
      : ((await sql`
          SELECT id, type, name, year, description, essay, position_x, position_y,
                 origin, spotify_url, created_at, updated_at
          FROM entities
          WHERE id = ANY(${idsInWindow}::uuid[]) AND deleted_at IS NULL
        `) as EntityRow[])

  // 4) Fetch edges whose endpoints are BOTH in the window — this is what
  // makes the subgraph a self-contained drawable.
  type RelRow = {
    id: string
    from_id: string
    to_id: string
    type: string
    notes: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  const relRows =
    idsInWindow.length < 2
      ? []
      : ((await sql`
          SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
          FROM relationships
          WHERE deleted_at IS NULL
            AND from_id = ANY(${idsInWindow}::uuid[])
            AND to_id   = ANY(${idsInWindow}::uuid[])
        `) as RelRow[])

  return Response.json({
    from: {
      ...focalRows[0],
      hopDistance: 0,
    },
    entities: entityRows.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      year: e.year,
      description: e.description,
      essay: e.essay,
      positionX: e.position_x,
      positionY: e.position_y,
      origin: e.origin,
      spotifyUrl: e.spotify_url,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      hopDistance: hopById.get(e.id) ?? 0,
    })),
    relationships: relRows.map((r) => ({
      id: r.id,
      fromId: r.from_id,
      toId: r.to_id,
      type: r.type,
      notes: r.notes,
      origin: r.origin,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    hops,
    limit,
    truncated: walkRows.length === limit,
  })
})

export const config: Config = {
  path: '/api/graph/neighbors',
}
