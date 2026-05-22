import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

type Origin = { kind: string; [key: string]: unknown }

function normalizeOrigin(value: unknown): Origin {
  if (value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as Origin
  }
  if (typeof value === 'string') {
    return { kind: value === 'ai' ? 'ai' : 'manual' }
  }
  return { kind: 'manual' }
}

export default withObservability('relationships', async (req: Request, context: Context) => {
  const sql = getSql()
  const id = context.params.id

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')

    // Backwards-compatible: sin ?limit → wholesale (GraphView lo consume así).
    if (!limitParam) {
      const REL_HARD_CAP = 10000
      const rows = await sql`
        SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
        FROM relationships
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT ${REL_HARD_CAP}
      `
      if (rows.length >= REL_HARD_CAP) {
        console.warn(
          `[relationships] hit REL_HARD_CAP (${REL_HARD_CAP}). Pagination across the app is now needed.`,
        )
      }
      return Response.json(rows)
    }

    // Paginated mode. Mismo patrón que /api/quotes y /api/entities.
    const parsedLimit = Number.parseInt(limitParam, 10)
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 200)
      : 50

    const cursorParam = url.searchParams.get('cursor')
    let cursorTs: string | null = null
    let cursorId: string | null = null
    if (cursorParam) {
      const sep = cursorParam.lastIndexOf(':')
      if (sep > 0) {
        cursorTs = cursorParam.slice(0, sep)
        cursorId = cursorParam.slice(sep + 1)
      }
    }

    const rows = cursorTs && cursorId
      ? (await sql`
          SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
          FROM relationships
          WHERE deleted_at IS NULL
            AND (created_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)
      : (await sql`
          SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
          FROM relationships
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)

    const items = (rows as Array<{ id: string; created_at: string }>).slice(0, limit)
    const hasMore = rows.length > limit
    const last = items[items.length - 1]
    const nextCursor = hasMore && last ? `${last.created_at}:${last.id}` : null

    return Response.json({ items, nextCursor })
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      from_id: string
      to_id: string
      type: string
      notes?: string | null
      origin?: unknown
    }
    const origin = JSON.stringify(normalizeOrigin(body.origin))
    const rows = await sql`
      INSERT INTO relationships (from_id, to_id, type, notes, origin)
      VALUES (
        ${body.from_id},
        ${body.to_id},
        ${body.type},
        ${body.notes ?? null},
        ${origin}::jsonb
      )
      RETURNING id, from_id, to_id, type, notes, origin, created_at, updated_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'PATCH' && id) {
    const body = (await req.json()) as {
      type?: string
      notes?: string | null
    }
    const rows = await sql`
      UPDATE relationships
      SET
        type  = COALESCE(${body.type ?? null}, type),
        notes = CASE WHEN ${body.notes !== undefined} THEN ${body.notes ?? null} ELSE notes END
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, from_id, to_id, type, notes, origin, created_at, updated_at
    `
    if (rows.length === 0) {
      return new Response('Relación no encontrada', { status: 404 })
    }
    return Response.json(rows[0])
  }

  if (req.method === 'DELETE' && id) {
    await sql`UPDATE relationships SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/relationships', '/api/relationships/:id'],
}
