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
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')

    // Backwards-compatible: sin ?limit devolvemos full array (lo que esperan
    // GraphView, sidebar search, ProposalPanel, etc. — modo wholesale).
    // Con ?limit pasamos a paginación por cursor, igual que /api/quotes.
    if (!limitParam) {
      const ENTITY_HARD_CAP = 5000
      const rows = await sql`
        SELECT id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, created_at, updated_at
        FROM entities
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT ${ENTITY_HARD_CAP}
      `
      if (rows.length >= ENTITY_HARD_CAP) {
        console.warn(
          `[entities] hit ENTITY_HARD_CAP (${ENTITY_HARD_CAP}). Pagination across the app is now needed.`,
        )
      }
      return Response.json(rows)
    }

    // Paginated mode. Cursor = "<created_at_iso>:<uuid>" del último item
    // entregado. Tuple comparison (created_at, id) DESC. El compuesto
    // (created_at DESC, id DESC) que se añadió en la migración A vuelve
    // esto sublineal.
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
          SELECT id, type, name, year, description, essay,
                 position_x, position_y, origin, spotify_url,
                 created_at, updated_at
          FROM entities
          WHERE deleted_at IS NULL
            AND (created_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)
      : (await sql`
          SELECT id, type, name, year, description, essay,
                 position_x, position_y, origin, spotify_url,
                 created_at, updated_at
          FROM entities
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)

    // OJO con el tipo de created_at: el driver Neon HTTP lo deserializa como
    // Date, no como string ISO. Si lo dejamos pasar a una template literal
    // (`${last.created_at}`), JS llama Date.prototype.toString() que produce
    // "Thu May 21 2026 16:12:30 GMT+0000 (Coordinated Universal Time)" — un
    // formato que Postgres NO parsea como timestamptz. Ese cursor vuelve al
    // server, falla el cast `::timestamptz`, y devolvemos 500 en cada scroll.
    // Forzamos ISO 8601 acá, que sí es estable y parseable.
    const items = (rows as Array<{ id: string; created_at: string | Date }>).slice(0, limit)
    const hasMore = rows.length > limit
    const last = items[items.length - 1]
    const nextCursor = hasMore && last
      ? `${new Date(last.created_at).toISOString()}:${last.id}`
      : null

    return Response.json({ items, nextCursor })
  }

  // POST /api/entities (crear) — pero NO /api/entities/:id/restore (que es
  // otro POST manejado más abajo). Sin este guard, el flujo de crear
  // intentaría parsear el body de restore como una nueva entidad y caería
  // en 500.
  if (req.method === 'POST' && !new URL(req.url).pathname.endsWith('/restore')) {
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

    // Duplicate-detection guard: if the caller didn't pass `?force=true`,
    // we check whether the new embedding is unusually close to an existing
    // entity (cosine distance < 0.20 ≈ similarity ≥ 0.90). If so, return
    // 409 with the suggested matches so the UI can ask "¿es la misma que X?"
    // before persisting. Skipped when there's no embedding (no key, etc.) —
    // we don't want to block writes just because embeddings are unavailable.
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
        WHERE deleted_at IS NULL
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
    // Soft delete con timestamp compartido entre la entidad y su cascade.
    // El restore lo usa para identificar exactamente qué se borró en este
    // acto y revertir solo eso (no relaciones borradas en otro momento).
    const tsRows = (await sql`SELECT NOW() AS now`) as Array<{ now: string }>
    const deletedAt = tsRows[0].now
    await sql`UPDATE entities SET deleted_at = ${deletedAt} WHERE id = ${id} AND deleted_at IS NULL`
    await sql`UPDATE relationships SET deleted_at = ${deletedAt} WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at IS NULL`
    await sql`UPDATE quotes SET deleted_at = ${deletedAt} WHERE entity_id = ${id} AND deleted_at IS NULL`
    return Response.json({ deletedAt })
  }

  // Restore (undo del DELETE). Recibe el deletedAt exacto del borrado para
  // restaurar la entidad + las filas cascadeadas en ese mismo acto.
  const url = new URL(req.url)
  if (req.method === 'POST' && id && url.pathname.endsWith('/restore')) {
    const body = (await req.json().catch(() => ({}))) as { deletedAt?: string }
    if (!body.deletedAt) {
      return new Response('deletedAt requerido', { status: 400 })
    }
    await sql`UPDATE entities SET deleted_at = NULL WHERE id = ${id} AND deleted_at = ${body.deletedAt}`
    await sql`UPDATE relationships SET deleted_at = NULL WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at = ${body.deletedAt}`
    await sql`UPDATE quotes SET deleted_at = NULL WHERE entity_id = ${id} AND deleted_at = ${body.deletedAt}`
    return Response.json({ restored: true })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/entities', '/api/entities/:id', '/api/entities/:id/restore'],
}
