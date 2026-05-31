import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForText } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildReflectPrompt } from './_lib/reflect-prompt.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

/**
 * POST /api/quotes/:id/reflect
 *
 * Generates a fresh AI interpretation of the quote and returns it WITHOUT
 * persisting. The UI presents it to the user; if they accept, the client
 * issues a PATCH /api/quotes/:id with the ai_reflection field set.
 *
 * This keeps the "AI scribe, human curates" contract: the model produces a
 * reading, the user decides whether to keep it.
 */
export default withObservability(
  'quote-reflect',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const id = context.params.id
    if (!id) return ApiErrors.validation(requestId, 'id requerido')

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    type Row = {
      text: string
      source: string | null
      context: string | null
      user_reflection: string | null
      embedding: string | null
      entity_name: string
      entity_type: string
      entity_description: string | null
    }
    const rows = (await sql`
      SELECT q.text, q.source, q.context, q.user_reflection,
             q.embedding::text AS embedding,
             e.name AS entity_name, e.type AS entity_type, e.description AS entity_description
      FROM quotes q
      JOIN entities e ON e.id = q.entity_id
        AND e.deleted_at IS NULL
        AND e.user_id = ${userId}
      WHERE q.id = ${id} AND q.deleted_at IS NULL AND q.user_id = ${userId}
    `) as Row[]
    const r = rows[0]
    if (!r) {
      return ApiErrors.notFound(requestId, 'Cita no encontrada')
    }

    // κ6: traer citas semánticamente vecinas si esta cita tiene embedding.
    // Excluimos la propia (self) y citas de la misma entidad de menor
    // interés (la IA tiende a comparar Cervantes-vs-Cervantes; lo que
    // queremos es el SALTO entre afinidades). Si no hay embedding, el
    // bloque queda vacío y la prompt sigue funcionando como antes.
    type NeighborRow = { text: string; entity_name: string }
    let neighbors: NeighborRow[] = []
    if (r.embedding) {
      neighbors = (await sql`
        SELECT q.text, e.name AS entity_name
        FROM quotes q
        JOIN entities e ON e.id = q.entity_id
          AND e.deleted_at IS NULL
          AND e.user_id = ${userId}
        WHERE q.id <> ${id}
          AND q.deleted_at IS NULL
          AND q.user_id = ${userId}
          AND q.embedding IS NOT NULL
        ORDER BY q.embedding <=> ${r.embedding}::vector
        LIMIT 5
      `) as NeighborRow[]
    }

    const messages = buildReflectPrompt({
      text: r.text,
      source: r.source,
      context: r.context,
      userReflection: r.user_reflection,
      entity: {
        name: r.entity_name,
        type: r.entity_type,
        description: r.entity_description,
      },
      neighbors: neighbors.map((n) => ({
        text: n.text,
        entityName: n.entity_name,
      })),
    })

    const invocation = await resolveAIInvocation(req, 'reflect', userId)
    if (invocation.kind === 'off') return aiOffResponse(requestId)

    try {
      const { content, usage, fromCache } = await askLLMForText(messages, {
        provider: invocation.provider,
        model: invocation.model,
      })
      const reflection = typeof content === 'string' ? content.trim() : String(content).trim()

      logEvent({
        event: 'quote_reflect_completed',
        quoteId: id,
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
      })

      sql`
        INSERT INTO extraction_log (
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
        ) VALUES (
          ${`reflect:${id}`},
          ${JSON.stringify({ reflection })}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.durationMs},
          ${userId}
        )
      `.catch(() => {})

      return Response.json({
        reflection,
        provider: usage.provider,
        model: usage.model,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return ApiErrors.upstream(requestId, `Error llamando al LLM: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/quotes/:id/reflect',
}
