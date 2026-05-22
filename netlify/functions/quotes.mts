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

export default withObservability('quotes', async (req: Request, context: Context) => {
  const sql = getSql()
  const id = context.params.id

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, entity_id, text, source, context,
             user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
             linked_quote_ids,
             origin, created_at, updated_at
      FROM quotes
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      entity_id: string
      text: string
      source?: string | null
      context?: string | null
      user_reflection?: string | null
      linked_quote_ids?: string[] | null
      origin?: unknown
    }
    const origin = JSON.stringify(normalizeOrigin(body.origin))
    const linked = Array.isArray(body.linked_quote_ids) ? body.linked_quote_ids : []
    const rows = await sql`
      INSERT INTO quotes (
        entity_id, text, source, context, user_reflection, linked_quote_ids, origin
      ) VALUES (
        ${body.entity_id},
        ${body.text},
        ${body.source ?? null},
        ${body.context ?? null},
        ${body.user_reflection ?? null},
        ${linked}::uuid[],
        ${origin}::jsonb
      )
      RETURNING id, entity_id, text, source, context,
                user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                linked_quote_ids,
                origin, created_at, updated_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'PATCH' && id) {
    const body = (await req.json()) as {
      text?: string
      source?: string | null
      context?: string | null
      entity_id?: string
      user_reflection?: string | null
      ai_reflection?: string | null
      ai_reflection_provider?: string | null
      ai_reflection_model?: string | null
      linked_quote_ids?: string[] | null
    }
    // Only update fields that were actually sent. ai_reflection has the
    // side effect of stamping ai_reflection_at when it changes. entity_id
    // can move the quote to a different entity (useful for fixing quotes
    // that ended up attached to a book instead of its author).
    const rows = await sql`
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
        linked_quote_ids       = CASE WHEN ${body.linked_quote_ids !== undefined} THEN ${Array.isArray(body.linked_quote_ids) ? body.linked_quote_ids : []}::uuid[] ELSE linked_quote_ids END
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, entity_id, text, source, context,
                user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at,
                linked_quote_ids,
                origin, created_at, updated_at
    `
    if (rows.length === 0) {
      return new Response('Cita no encontrada', { status: 404 })
    }
    return Response.json(rows[0])
  }

  if (req.method === 'DELETE' && id) {
    await sql`UPDATE quotes SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/quotes', '/api/quotes/:id'],
}
