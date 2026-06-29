import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { logErrorEvent } from './_lib/observability.js'
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
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseRows } from './_lib/row-parse.js'
import { QuoteRowSchema, type QuoteRow } from './_lib/backend-row-schemas.js'

function normalizeLinkedQuoteIds(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value)]
}

async function validateLinkedQuoteIds(
  sql: ReturnType<typeof getSql>,
  userId: string,
  linkedQuoteIds: string[],
  requestId: string,
  currentQuoteId?: string,
): Promise<Response | null> {
  if (linkedQuoteIds.length === 0) return null
  if (currentQuoteId && linkedQuoteIds.includes(currentQuoteId)) {
    return ApiErrors.validation(requestId, 'Una cita no puede vincularse a sí misma')
  }

  const rows = await sqlTyped<{ id: string }>(sql`
    SELECT id
    FROM quotes
    WHERE id = ANY(${linkedQuoteIds}::uuid[])
      AND deleted_at IS NULL
      AND user_id = ${userId}
  `)

  if (rows.length !== linkedQuoteIds.length) {
    return ApiErrors.notFound(requestId, 'Una o más citas vinculadas no existen')
  }
  return null
}

export default withObservability('quotes', async (req: Request, context: Context, { requestId }) => {
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id
  const sql = getSql()
  const id = context.params.id

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')

    // Backwards-compatible: without ?limit we keep returning the full array
    // (the historical shape, used by hooks that still need every quote).
    // With ?limit we switch to cursor pagination, returning { items, nextCursor }.
    if (!limitParam) {
      const rows = parseRows(
        await sqlTyped<QuoteRow>(sql`
        SELECT id, entity_id, text, source, context, link,
               user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
               linked_quote_ids, pinned_at, resonance,
               origin, created_at, updated_at
        FROM quotes
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY created_at DESC, id DESC
      `),
        QuoteRowSchema,
        'quotes.list.wholesale',
      )
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
      ? parseRows(
          await sqlTyped<QuoteRow>(sql`
          SELECT id, entity_id, text, source, context, link,
                 user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                 linked_quote_ids, pinned_at, resonance,
                 origin, created_at, updated_at
          FROM quotes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (created_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
          LIMIT ${limit + 1}
        `),
          QuoteRowSchema,
          'quotes.list.paginated.cursor',
        )
      : parseRows(
          await sqlTyped<QuoteRow>(sql`
          SELECT id, entity_id, text, source, context, link,
                 user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                 linked_quote_ids, pinned_at, resonance,
                 origin, created_at, updated_at
          FROM quotes
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
          LIMIT ${limit + 1}
        `),
          QuoteRowSchema,
          'quotes.list.paginated.first',
        )

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
    await ensureUserRow(sql, authedUser)
    const body = parsed.data
    const origin = JSON.stringify(normalizeOrigin(body.origin))
    const linked = normalizeLinkedQuoteIds(body.linked_quote_ids)

    // Look up the entity name so the embedding has the attribution baked in
    // (so "frase de Borges sobre el tiempo" matches even if "Borges" is just
    // in the relationship, not in the quote text).
    const entityNameRows = (await sql`
      SELECT name
      FROM entities
      WHERE id = ${body.entity_id} AND deleted_at IS NULL AND user_id = ${userId}
    `) as Array<{ name: string }>
    const entityName = entityNameRows[0]?.name ?? null
    if (!entityName) {
      return ApiErrors.notFound(requestId, 'Entidad no encontrada')
    }

    const linkedError = await validateLinkedQuoteIds(sql, userId, linked, requestId)
    if (linkedError) return linkedError

    const emb = await embedSafe(
      quoteEmbeddingText({
        text: body.text,
        entityName,
        source: body.source ?? null,
        context: body.context ?? null,
      }),
    )

    const rows = parseRows(
      await sqlTyped<QuoteRow>(sql`
      INSERT INTO quotes (
        entity_id, text, source, context, link, user_reflection, linked_quote_ids, origin,
        embedding, embedding_model, embedding_at, user_id
      ) VALUES (
        ${body.entity_id},
        ${body.text},
        ${body.source ?? null},
        ${body.context ?? null},
        ${body.link ?? null},
        ${body.user_reflection ?? null},
        ${linked}::uuid[],
        ${origin}::jsonb,
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null},
        ${userId}
      )
      RETURNING id, entity_id, text, source, context, link,
                user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                linked_quote_ids, pinned_at, resonance,
                origin, created_at, updated_at
    `),
      QuoteRowSchema,
      'quotes.create.returning',
    )
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'PATCH' && id) {
    const parsed = await parseJsonBody(req, QuotePatchBody, requestId)
    if (!parsed.ok) return parsed.response
    await ensureUserRow(sql, authedUser)
    const body = parsed.data
    const linked =
      body.linked_quote_ids !== undefined
        ? normalizeLinkedQuoteIds(body.linked_quote_ids)
        : undefined
    if (body.entity_id !== undefined) {
      const entityRows = (await sql`
        SELECT id FROM entities
        WHERE id = ${body.entity_id} AND deleted_at IS NULL AND user_id = ${userId}
      `) as Array<{ id: string }>
      if (entityRows.length === 0) {
        return ApiErrors.notFound(requestId, 'Entidad no encontrada')
      }
    }
    if (linked !== undefined) {
      const linkedError = await validateLinkedQuoteIds(sql, userId, linked, requestId, id)
      if (linkedError) return linkedError
    }
    const embeddingInputTouched =
      body.text !== undefined ||
      body.source !== undefined ||
      body.context !== undefined ||
      body.entity_id !== undefined
    let embeddingDirty = false
    if (embeddingInputTouched) {
      const currentRows = await sqlTyped<{
        text: string
        source: string | null
        context: string | null
        entity_id: string
      }>(sql`
        SELECT text, source, context, entity_id
        FROM quotes
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `)
      const current = currentRows[0]
      embeddingDirty = Boolean(
        current &&
          ((body.text !== undefined && body.text !== current.text) ||
            (body.source !== undefined && (body.source ?? null) !== current.source) ||
            (body.context !== undefined &&
              (body.context ?? null) !== current.context) ||
            (body.entity_id !== undefined && body.entity_id !== current.entity_id)),
      )
    }
    // ω-E: pinned boolean — el cliente manda true/false. El server
    // mapea a pinned_at = NOW() o NULL respectivamente. Si no se
    // manda, no se toca el campo.
    // Only update fields that were actually sent. ai_reflection has the
    // side effect of stamping ai_reflection_at when it changes. entity_id
    // can move the quote to a different entity (useful for fixing quotes
    // that ended up attached to a book instead of its author).
    const rows = parseRows(
      await sqlTyped<QuoteRow>(sql`
      UPDATE quotes
      SET
        text                   = COALESCE(${body.text ?? null}, text),
        source                 = CASE WHEN ${body.source !== undefined} THEN ${body.source ?? null} ELSE source END,
        context                = CASE WHEN ${body.context !== undefined} THEN ${body.context ?? null} ELSE context END,
        link                   = CASE WHEN ${body.link !== undefined} THEN ${body.link ?? null} ELSE link END,
        entity_id              = COALESCE(${body.entity_id ?? null}, entity_id),
        user_reflection        = CASE WHEN ${body.user_reflection !== undefined} THEN ${body.user_reflection ?? null} ELSE user_reflection END,
        ai_reflection          = CASE WHEN ${body.ai_reflection !== undefined} THEN ${body.ai_reflection ?? null} ELSE ai_reflection END,
        ai_reflection_provider = CASE WHEN ${body.ai_reflection_provider !== undefined} THEN ${body.ai_reflection_provider ?? null} ELSE ai_reflection_provider END,
        ai_reflection_model    = CASE WHEN ${body.ai_reflection_model !== undefined} THEN ${body.ai_reflection_model ?? null} ELSE ai_reflection_model END,
        ai_reflection_at       = CASE WHEN ${body.ai_reflection !== undefined} THEN NOW() ELSE ai_reflection_at END,
        linked_quote_ids       = CASE WHEN ${body.linked_quote_ids !== undefined} THEN ${linked ?? []}::uuid[] ELSE linked_quote_ids END,
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
      RETURNING id, entity_id, text, source, context, link,
                user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                linked_quote_ids, pinned_at, resonance,
                origin, created_at, updated_at
    `),
      QuoteRowSchema,
      'quotes.patch.returning',
    )
    if (rows.length === 0) {
      return ApiErrors.notFound(requestId, 'Cita no encontrada')
    }

    // Re-embed when anything that goes into the embedding changed. Fire and
    // forget so the PATCH response isn't held up by an embeddings call.
    if (embeddingDirty) {
      const updated = rows[0] as {
        text: string
        source: string | null
        context: string | null
        entity_id: string
      }
      ;(async () => {
        const nameRows = (await sql`
          SELECT name FROM entities
          WHERE id = ${updated.entity_id} AND deleted_at IS NULL AND user_id = ${userId}
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
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        `
      })().catch((err) => {
        logErrorEvent({
          event: 'quote_embedding_update_failed',
          quoteId: id,
          message: err instanceof Error ? err.message : String(err),
        })
      })
    }

    return Response.json(rows[0])
  }

  if (req.method === 'DELETE' && id) {
    await ensureUserRow(sql, authedUser)
    const rows = await sqlTyped<{ deleted_at: string }>(sql`
      UPDATE quotes
      SET deleted_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING deleted_at
    `)
    const deletedAt = rows[0]?.deleted_at
    if (!deletedAt) return ApiErrors.notFound(requestId, 'Cita no encontrada')
    return Response.json({ deletedAt })
  }

  const url = new URL(req.url)
  if (req.method === 'POST' && id && url.pathname.endsWith('/restore')) {
    const parsed = await parseJsonBody(req, QuoteRestoreBody, requestId)
    if (!parsed.ok) return parsed.response
    await ensureUserRow(sql, authedUser)
    const { deletedAt } = parsed.data
    const rows = await sqlTyped<{ id: string }>(sql`
      UPDATE quotes
      SET deleted_at = NULL
      WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
      RETURNING id
    `)
    if (rows.length === 0) return ApiErrors.notFound(requestId, 'Cita no encontrada')
    return Response.json({ restored: true })
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: ['/api/quotes', '/api/quotes/:id', '/api/quotes/:id/restore'],
}
