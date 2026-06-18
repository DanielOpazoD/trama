import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { logEvent } from './_lib/observability.js'
import {
  RelationshipCreateBody,
  RelationshipPatchBody,
  RelationshipRestoreBody,
} from './_lib/relationship-schemas.js'

import { normalizeOrigin } from './_lib/origin.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

// Shape devuelto por los SELECT/RETURNING de relaciones (snake_case, raw).
type RelationshipRow = {
  id: string
  from_id: string
  from_name?: string | null
  to_id: string
  to_name?: string | null
  type: string
  notes: string | null
  origin: unknown
  created_at: string
  updated_at: string
}

export default withObservability(
  'relationships',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const limitParam = url.searchParams.get('limit')

      // Backwards-compatible: sin ?limit → wholesale (GraphView lo consume así).
      if (!limitParam) {
        const REL_HARD_CAP = 10000
        const rows = await sqlTyped<RelationshipRow>(sql`
        SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
        FROM relationships
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${REL_HARD_CAP}
      `)
        if (rows.length >= REL_HARD_CAP) {
          // Q2: canónico vía logEvent en lugar de console.warn.
          logEvent({
            event: 'relationships_hard_cap_hit',
            cap: REL_HARD_CAP,
            message: 'Pagination across the app is now needed.',
          })
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

      const rows =
        cursorTs && cursorId
          ? await sqlTyped<RelationshipRow>(sql`
          SELECT r.id, r.from_id, ef.name AS from_name, r.to_id, et.name AS to_name,
                 r.type, r.notes, r.origin, r.created_at, r.updated_at
          FROM relationships r
          JOIN entities ef ON ef.id = r.from_id
            AND ef.deleted_at IS NULL
            AND ef.user_id = ${userId}
          JOIN entities et ON et.id = r.to_id
            AND et.deleted_at IS NULL
            AND et.user_id = ${userId}
          WHERE r.deleted_at IS NULL AND r.user_id = ${userId}
            AND (r.created_at, r.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ${limit + 1}
        `)
          : await sqlTyped<RelationshipRow>(sql`
          SELECT r.id, r.from_id, ef.name AS from_name, r.to_id, et.name AS to_name,
                 r.type, r.notes, r.origin, r.created_at, r.updated_at
          FROM relationships r
          JOIN entities ef ON ef.id = r.from_id
            AND ef.deleted_at IS NULL
            AND ef.user_id = ${userId}
          JOIN entities et ON et.id = r.to_id
            AND et.deleted_at IS NULL
            AND et.user_id = ${userId}
          WHERE r.deleted_at IS NULL AND r.user_id = ${userId}
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ${limit + 1}
        `)

      // Ver entities.mts para el contexto: Neon HTTP devuelve created_at como
      // Date, y la stringificación default es ilegible para Postgres. Forzamos
      // ISO para que el cursor sea reparseable en la siguiente página.
      const items = (rows as Array<{ id: string; created_at: string | Date }>).slice(
        0,
        limit,
      )
      const hasMore = rows.length > limit
      const last = items[items.length - 1]
      const nextCursor =
        hasMore && last ? `${new Date(last.created_at).toISOString()}:${last.id}` : null

      return Response.json({ items, nextCursor })
    }

    // POST /api/relationships (crear) — pero NO /api/relationships/:id/restore.
    if (req.method === 'POST' && !new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RelationshipCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const body = parsed.data
      const entityRows = await sqlTyped<{ id: string }>(sql`
        SELECT id
        FROM entities
        WHERE id = ANY(${[body.from_id, body.to_id]}::uuid[])
          AND deleted_at IS NULL
          AND user_id = ${userId}
      `)
      if (new Set(entityRows.map((row) => row.id)).size !== 2) {
        return ApiErrors.notFound(requestId, 'Entidad origen o destino no encontrada')
      }
      const origin = JSON.stringify(normalizeOrigin(body.origin))
      const rows = await sqlTyped<RelationshipRow>(sql`
      INSERT INTO relationships (from_id, to_id, type, notes, origin, user_id)
      VALUES (
        ${body.from_id},
        ${body.to_id},
        ${body.type},
        ${body.notes ?? null},
        ${origin}::jsonb,
        ${userId}
      )
      RETURNING id, from_id, to_id, type, notes, origin, created_at, updated_at
    `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, RelationshipPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const body = parsed.data
      const rows = await sqlTyped<RelationshipRow>(sql`
      UPDATE relationships
      SET
        type  = COALESCE(${body.type ?? null}, type),
        notes = CASE WHEN ${body.notes !== undefined} THEN ${body.notes ?? null} ELSE notes END
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, from_id, to_id, type, notes, origin, created_at, updated_at
    `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Relación no encontrada')
      }
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      await ensureUserRow(sql, authedUser)
      const rows = await sqlTyped<{ deleted_at: string }>(sql`
        UPDATE relationships
        SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING deleted_at
      `)
      const deletedAt = rows[0]?.deleted_at
      if (!deletedAt) {
        return ApiErrors.notFound(requestId, 'Relación no encontrada')
      }
      return Response.json({ deletedAt })
    }

    const url = new URL(req.url)
    if (req.method === 'POST' && id && url.pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RelationshipRestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const { deletedAt } = parsed.data
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE relationships
        SET deleted_at = NULL
        WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
        RETURNING id
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Relación no encontrada')
      }
      return Response.json({ restored: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/relationships',
    '/api/relationships/:id',
    '/api/relationships/:id/restore',
  ],
}
