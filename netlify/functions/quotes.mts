import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import {
  QuoteCreateBody,
  QuotePatchBody,
  QuoteRestoreBody,
} from './_lib/quote-schemas.js'
import {
  embedSafe,
  quoteEmbeddingText,
  toPgVector,
} from './_lib/embeddings.js'

import { normalizeOrigin } from './_lib/origin.js'

// Shape devuelto por los SELECT/RETURNING de citas (snake_case, raw).
// El cliente lo transforma vía quoteFromRow.
type QuoteRow = {
  id: string
  entity_id: string
  text: string
  source: string | null
  context: string | null
  user_reflection: string | null
  ai_reflection: string | null
  ai_reflection_provider: string | null
  ai_reflection_model: string | null
  ai_reflection_at: string | null
  linked_quote_ids: string[]
  pinned_at: string | null
  resonance: number | null
  origin: unknown
  created_at: string
  updated_at: string
}

export default withObservability('quotes', async (req: Request, context: Context, { requestId }) => {
  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()
  const id = context.params.id

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')

    // Backwards-compatible: without ?limit we keep returning the full array
    // (the historical shape, used by hooks that still need every quote).
    // With ?limit we switch to cursor pagination, returning { items, nextCursor }.
    if (!limitParam) {
      const rows = await sql`
        SELECT id, entity_id, text, source, context,
               user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
               linked_quote_ids, resonance,
               origin, created_at, updated_at
        FROM quotes
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY created_at DESC, id DESC
      `
      return Response.json(rows)
    }

    // Paginated mode. Cursor is "<iso_ts>:<uuid>" of the last item the
    // client received. Tuple comparison on (created_at, id) keeps the page
    // boundary stable even when many quotes share the same created_at.
    const parsedLimit = Number.parseInt(limitParam, 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50

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

    // We fetch limit + 1 so we can tell whether there's a next page without
    // a separate count query.
    // ω-E: incluimos pinned_at en el SELECT y lo usamos en el ORDER BY:
    // pinned_at primero (DESC, nulls al final), después created_at DESC,
    // después id DESC para tie-break. Las favoritas suben al tope.
    const rows = cursorTs && cursorId
      ? await sqlTyped<QuoteRow>(sql`
          SELECT id, entity_id, text, source, context,
                 user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                 linked_quote_ids, pinned_at, resonance,
                 origin, created_at, updated_at
          FROM quotes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (created_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)
      : await sqlTyped<QuoteRow>(sql`
          SELECT id, entity_id, text, source, context,
                 user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                 linked_quote_ids, pinned_at, resonance,
                 origin, created_at, updated_at
          FROM quotes
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
          LIMIT ${limit + 1}
        `)

    // Ver entities.mts para el contexto: Neon HTTP devuelve created_at como
    // Date, y la stringificación default rompe el parser de Postgres. Forzamos
    // ISO para que el cursor sea reparseable en la siguiente página.
    const items = rows.slice(0, limit) as Array<{ id: string; created_at: string | Date }>
    const hasMore = rows.length > limit
    const last = items[items.length - 1]
    const nextCursor = hasMore && last
      ? `${new Date(last.created_at).toISOString()}:${last.id}`
      : null

    return Response.json({ items, nextCursor })
  }

  // POST /api/quotes (crear) — pero NO /api/quotes/:id/restore.
  if (req.method === 'POST' && !new URL(req.url).pathname.endsWith('/restore')) {
    const parsed = await parseJsonBody(req, QuoteCreateBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data
    const origin = JSON.stringify(normalizeOrigin(body.origin))
    const linked = Array.isArray(body.linked_quote_ids) ? body.linked_quote_ids : []

    // Look up the entity name so the embedding has the attribution baked in
    // (so "frase de Borges sobre el tiempo" matches even if "Borges" is just
    // in the relationship, not in the quote text).
    const entityNameRows = (await sql`
      SELECT name FROM entities WHERE id = ${body.entity_id} AND deleted_at IS NULL
    `) as Array<{ name: string }>
    const entityName = entityNameRows[0]?.name ?? null

    const emb = await embedSafe(
      quoteEmbeddingText({
        text: body.text,
        entityName,
        source: body.source ?? null,
        context: body.context ?? null,
      }),
    )

    const rows = await sqlTyped<QuoteRow>(sql`
      INSERT INTO quotes (
        entity_id, text, source, context, user_reflection, linked_quote_ids, origin,
        embedding, embedding_model, embedding_at, user_id
      ) VALUES (
        ${body.entity_id},
        ${body.text},
        ${body.source ?? null},
        ${body.context ?? null},
        ${body.user_reflection ?? null},
        ${linked}::uuid[],
        ${origin}::jsonb,
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null},
        ${userId}
      )
      RETURNING id, entity_id, text, source, context,
                user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                linked_quote_ids, pinned_at, resonance,
                origin, created_at, updated_at
    `)
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'PATCH' && id) {
    const parsed = await parseJsonBody(req, QuotePatchBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data
    // ω-E: pinned boolean — el cliente manda true/false. El server
    // mapea a pinned_at = NOW() o NULL respectivamente. Si no se
    // manda, no se toca el campo.
    // Only update fields that were actually sent. ai_reflection has the
    // side effect of stamping ai_reflection_at when it changes. entity_id
    // can move the quote to a different entity (useful for fixing quotes
    // that ended up attached to a book instead of its author).
    const rows = await sqlTyped<QuoteRow>(sql`
      UPDATE quotes
      SET
        text                   = COALESCE(${body.text ?? null}, text),
        source                 = CASE WHEN ${body.source !== undefined} THEN ${body.source ?? null} ELSE source END,
        context                = CASE WHEN ${body.context !== undefined} THEN ${body.context ?? null} ELSE context END,
        entity_id              = COALESCE(${body.entity_id ?? null}, entity_id),
        user_reflection        = CASE WHEN ${body.user_reflection !== undefined} THEN ${body.user_reflection ?? null} ELSE user_reflection END,
        ai_reflection          = CASE WHEN ${body.ai_reflection !== undefined} THEN ${body.ai_reflection ?? null} ELSE ai_reflection END,
        ai_reflection_provider = CASE WHEN ${body.ai_reflection_provider !== undefined} THEN ${body.ai_reflection_provider ?? null} ELSE ai_reflection_provider END,
        ai_reflection_model    = CASE WHEN ${body.ai_reflection_model !== undefined} THEN ${body.ai_reflection_model ?? null} ELSE ai_reflection_model END,
        ai_reflection_at       = CASE WHEN ${body.ai_reflection !== undefined} THEN NOW() ELSE ai_reflection_at END,
        linked_quote_ids       = CASE WHEN ${body.linked_quote_ids !== undefined} THEN ${Array.isArray(body.linked_quote_ids) ? body.linked_quote_ids : []}::uuid[] ELSE linked_quote_ids END,
        pinned_at              = CASE
                                   WHEN ${body.pinned === true} THEN NOW()
                                   WHEN ${body.pinned === false} THEN NULL
                                   ELSE pinned_at
                                 END,
        -- U-1: resonancia 1-5 o null (destildar). undefined → no tocar.
        resonance              = CASE
                                   WHEN ${body.resonance !== undefined} THEN ${body.resonance ?? null}::smallint
                                   ELSE resonance
                                 END
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, entity_id, text, source, context,
                user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                linked_quote_ids, pinned_at, resonance,
                origin, created_at, updated_at
    `)
    if (rows.length === 0) {
      return ApiErrors.notFound(requestId, 'Cita no encontrada')
    }

    // Re-embed when anything that goes into the embedding changed. Fire and
    // forget so the PATCH response isn't held up by an embeddings call.
    const embeddingDirty =
      body.text !== undefined ||
      body.source !== undefined ||
      body.context !== undefined ||
      body.entity_id !== undefined
    if (embeddingDirty) {
      const updated = rows[0] as {
        text: string
        source: string | null
        context: string | null
        entity_id: string
      }
      ;(async () => {
        const nameRows = (await sql`
          SELECT name FROM entities WHERE id = ${updated.entity_id} AND deleted_at IS NULL
        `) as Array<{ name: string }>
        const emb = await embedSafe(
          quoteEmbeddingText({
            text: updated.text,
            entityName: nameRows[0]?.name ?? null,
            source: updated.source,
            context: updated.context,
          }),
        )
        if (!emb) return
        await sql`
          UPDATE quotes
          SET embedding = ${toPgVector(emb.vector)}::vector,
              embedding_model = ${emb.model},
              embedding_at = NOW()
          WHERE id = ${id}
        `
      })().catch(() => {})
    }

    return Response.json(rows[0])
  }

  if (req.method === 'DELETE' && id) {
    const tsRows = (await sql`SELECT NOW() AS now`) as Array<{ now: string }>
    const deletedAt = tsRows[0]?.now ?? new Date().toISOString()
    await sql`UPDATE quotes SET deleted_at = ${deletedAt} WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}`
    return Response.json({ deletedAt })
  }

  const url = new URL(req.url)
  if (req.method === 'POST' && id && url.pathname.endsWith('/restore')) {
    const parsed = await parseJsonBody(req, QuoteRestoreBody, requestId)
    if (!parsed.ok) return parsed.response
    const { deletedAt } = parsed.data
    await sql`UPDATE quotes SET deleted_at = NULL WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}`
    return Response.json({ restored: true })
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: ['/api/quotes', '/api/quotes/:id', '/api/quotes/:id/restore'],
}
