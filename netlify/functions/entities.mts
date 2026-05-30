import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { logEvent } from './_lib/observability.js'
import {
  EntityCreateBody,
  EntityPatchBody,
  EntityRestoreBody,
} from './_lib/entity-schemas.js'
import { embedSafe, entityEmbeddingText, toPgVector } from './_lib/embeddings.js'
import { normalizeOrigin } from './_lib/origin.js'
import { findGrokipediaUrl } from './_lib/grokipedia.js'

// Shape devuelto por los SELECT/RETURNING de entidades (snake_case, raw).
// El cliente lo transforma vía entityFromRow.
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
  wikipedia_url: string | null
  grokipedia_url: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'entities',
  async (req: Request, context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const limitParam = url.searchParams.get('limit')

      if (!limitParam) {
        const ENTITY_HARD_CAP = 5000
        const rows = await sqlTyped<EntityRow>(sql`
        SELECT id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
        FROM entities
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${ENTITY_HARD_CAP}
      `)
        if (rows.length >= ENTITY_HARD_CAP) {
          logEvent({
            event: 'entities_hard_cap_hit',
            cap: ENTITY_HARD_CAP,
            message: 'Pagination across the app is now needed.',
          })
        }
        return Response.json(rows)
      }

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
          ? await sqlTyped<EntityRow>(sql`
          SELECT id, type, name, year, description, essay,
                 position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url,
                 created_at, updated_at
          FROM entities
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (created_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)
          : await sqlTyped<EntityRow>(sql`
          SELECT id, type, name, year, description, essay,
                 position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url,
                 created_at, updated_at
          FROM entities
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)

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

    if (req.method === 'POST' && !new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, EntityCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      const origin = JSON.stringify(normalizeOrigin(body.origin))

      const emb = await embedSafe(
        entityEmbeddingText({
          name: body.name,
          type: body.type,
          year: body.year ?? null,
          description: body.description ?? null,
        }),
      )

      const url = new URL(req.url)
      const force = url.searchParams.get('force') === 'true'
      if (emb && !force) {
        type DupRow = {
          id: string
          name: string
          type: string
          description: string | null
          distance: number
        }
        const dupRows = (await sql`
        SELECT id, name, type, description,
               (embedding <=> ${toPgVector(emb.vector)}::vector) AS distance
        FROM entities
        WHERE deleted_at IS NULL AND user_id = ${userId}
          AND embedding IS NOT NULL
          AND embedding <=> ${toPgVector(emb.vector)}::vector < 0.20
        ORDER BY embedding <=> ${toPgVector(emb.vector)}::vector
        LIMIT 3
      `) as DupRow[]
        if (dupRows.length > 0) {
          return Response.json(
            {
              error: 'possible_duplicate',
              suggestions: dupRows.map((d) => ({
                id: d.id,
                name: d.name,
                type: d.type,
                description: d.description,
                similarity: Math.max(0, Math.min(1, 1 - Number(d.distance) / 2)),
              })),
            },
            { status: 409 },
          )
        }
      }

      const rows = await sqlTyped<EntityRow>(sql`
      INSERT INTO entities (
        type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url,
        embedding, embedding_model, embedding_at, user_id
      )
      VALUES (
        ${body.type},
        ${body.name},
        ${body.year ?? null},
        ${body.description ?? null},
        ${body.essay ?? null},
        ${body.position_x ?? null},
        ${body.position_y ?? null},
        ${origin}::jsonb,
        ${body.spotify_url ?? null},
        ${body.wikipedia_url ?? null},
        ${body.grokipedia_url ?? null},
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null},
        ${userId}
      )
      RETURNING id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
    `)

      const created = rows[0]

      // === Enriquecimiento automático con Grokipedia (no bloqueante) ===
      if (created) {
        // Fire and forget para no retrasar la respuesta al usuario
        findGrokipediaUrl(created.name, created.type)
          .then((url) => {
            if (url) {
              return sql`
                UPDATE entities 
                SET grokipedia_url = ${url} 
                WHERE id = ${created.id}
              `
            }
          })
          .catch(() => {
            // silencioso: el enriquecimiento no es crítico
          })
      }

      return Response.json(created, { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, EntityPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data

      const rows = await sqlTyped<EntityRow>(sql`
      UPDATE entities
      SET
        name        = COALESCE(${body.name ?? null}, name),
        type        = COALESCE(${body.type ?? null}, type),
        year        = CASE WHEN ${body.year !== undefined} THEN ${body.year ?? null} ELSE year END,
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        essay       = CASE WHEN ${body.essay !== undefined} THEN ${body.essay ?? null} ELSE essay END,
        position_x  = CASE WHEN ${body.position_x !== undefined} THEN ${body.position_x ?? null} ELSE position_x END,
        position_y  = CASE WHEN ${body.position_y !== undefined} THEN ${body.position_y ?? null} ELSE position_y END,
        spotify_url = CASE WHEN ${body.spotify_url !== undefined} THEN ${body.spotify_url ?? null} ELSE spotify_url END,
        wikipedia_url = CASE WHEN ${body.wikipedia_url !== undefined} THEN ${body.wikipedia_url ?? null} ELSE wikipedia_url END,
        grokipedia_url = CASE WHEN ${body.grokipedia_url !== undefined} THEN ${body.grokipedia_url ?? null} ELSE grokipedia_url END
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
    `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Entidad no encontrada')
      }

      const embeddingDirty =
        body.name !== undefined ||
        body.type !== undefined ||
        body.year !== undefined ||
        body.description !== undefined
      if (embeddingDirty) {
        const updated = rows[0] as {
          name: string
          type: string
          year: number | null
          description: string | null
        }
        embedSafe(
          entityEmbeddingText({
            name: updated.name,
            type: updated.type,
            year: updated.year,
            description: updated.description,
          }),
        )
          .then((emb) => {
            if (!emb) return
            return sql`
            UPDATE entities
            SET embedding = ${toPgVector(emb.vector)}::vector,
                embedding_model = ${emb.model},
                embedding_at = NOW()
            WHERE id = ${id}
          `
          })
          .catch(() => {})
      }

      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      const tsRows = (await sql`SELECT NOW() AS now`) as Array<{ now: string }>
      const deletedAt = tsRows[0]?.now ?? new Date().toISOString()
      await sql`UPDATE entities SET deleted_at = ${deletedAt} WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}`
      await sql`UPDATE relationships SET deleted_at = ${deletedAt} WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at IS NULL AND user_id = ${userId}`
      await sql`UPDATE quotes SET deleted_at = ${deletedAt} WHERE entity_id = ${id} AND deleted_at IS NULL AND user_id = ${userId}`
      return Response.json({ deletedAt })
    }

    const url = new URL(req.url)
    if (req.method === 'POST' && id && url.pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, EntityRestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      await sql`UPDATE entities SET deleted_at = NULL WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}`
      await sql`UPDATE relationships SET deleted_at = NULL WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at = ${deletedAt} AND user_id = ${userId}`
      await sql`UPDATE quotes SET deleted_at = NULL WHERE entity_id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}`
      return Response.json({ restored: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/entities', '/api/entities/:id', '/api/entities/:id/restore'],
}
