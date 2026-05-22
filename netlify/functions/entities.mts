import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import {
  embedSafe,
  entityEmbeddingText,
  toPgVector,
} from './_lib/embeddings.js'

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

export default withObservability('entities', async (req: Request, context: Context) => {
  const sql = getSql()
  const id = context.params.id

  if (req.method === 'GET') {
    // Safety cap: the graph + sidebar + autocomplete consume this endpoint
    // wholesale (they can't paginate without breaking semantics), so we cap
    // it at 5000 rows. Above that, the user is at a scale where pagination
    // becomes necessary across the board — we log a warning to detect it.
    const ENTITY_HARD_CAP = 5000
    const rows = await sql`
      SELECT id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, created_at, updated_at
      FROM entities
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${ENTITY_HARD_CAP}
    `
    if (rows.length >= ENTITY_HARD_CAP) {
      console.warn(
        `[entities] hit ENTITY_HARD_CAP (${ENTITY_HARD_CAP}). Pagination across the app is now needed.`,
      )
    }
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      type: string
      name: string
      year?: number | null
      description?: string | null
      essay?: string | null
      position_x?: number | null
      position_y?: number | null
      origin?: unknown
      spotify_url?: string | null
    }
    const origin = JSON.stringify(normalizeOrigin(body.origin))

    // Embed before inserting so the row lands with its vector populated.
    // embedSafe returns null on any failure (no key, network issue, etc.) —
    // the row is still created and a future re-index can backfill.
    const emb = await embedSafe(
      entityEmbeddingText({
        name: body.name,
        type: body.type,
        year: body.year ?? null,
        description: body.description ?? null,
      }),
    )

    const rows = await sql`
      INSERT INTO entities (
        type, name, year, description, essay, position_x, position_y, origin, spotify_url,
        embedding, embedding_model, embedding_at
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
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null}
      )
      RETURNING id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, created_at, updated_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'PATCH' && id) {
    const body = (await req.json()) as {
      name?: string
      type?: string
      year?: number | null
      description?: string | null
      essay?: string | null
      position_x?: number | null
      position_y?: number | null
      spotify_url?: string | null
    }
    // Only update fields that were actually sent. Postgres COALESCE pattern.
    const rows = await sql`
      UPDATE entities
      SET
        name        = COALESCE(${body.name ?? null}, name),
        type        = COALESCE(${body.type ?? null}, type),
        year        = CASE WHEN ${body.year !== undefined} THEN ${body.year ?? null} ELSE year END,
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        essay       = CASE WHEN ${body.essay !== undefined} THEN ${body.essay ?? null} ELSE essay END,
        position_x  = CASE WHEN ${body.position_x !== undefined} THEN ${body.position_x ?? null} ELSE position_x END,
        position_y  = CASE WHEN ${body.position_y !== undefined} THEN ${body.position_y ?? null} ELSE position_y END,
        spotify_url = CASE WHEN ${body.spotify_url !== undefined} THEN ${body.spotify_url ?? null} ELSE spotify_url END
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, created_at, updated_at
    `
    if (rows.length === 0) {
      return new Response('Entidad no encontrada', { status: 404 })
    }

    // Re-embed if anything that feeds the embedding changed. We don't await
    // before responding to keep the PATCH snappy — the embedding catches up
    // in the background (best-effort).
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
    // Soft delete: also cascade-soft-delete the entity's relationships and quotes.
    await sql`UPDATE entities SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
    await sql`UPDATE relationships SET deleted_at = NOW() WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at IS NULL`
    await sql`UPDATE quotes SET deleted_at = NOW() WHERE entity_id = ${id} AND deleted_at IS NULL`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/entities', '/api/entities/:id'],
}
