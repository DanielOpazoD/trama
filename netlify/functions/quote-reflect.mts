import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForText } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildReflectPrompt } from './_lib/reflect-prompt.js'
import { withObservability } from './_lib/handler-wrap.js'
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
  async (req: Request, context: Context) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    const id = context.params.id
    if (!id) return new Response('id requerido', { status: 400 })

    const budgetExceeded = await checkMonthlyBudget()
    if (budgetExceeded) return budgetExceeded

    const sql = getSql()

    type Row = {
      text: string
      source: string | null
      context: string | null
      user_reflection: string | null
      entity_name: string
      entity_type: string
      entity_description: string | null
    }
    const rows = (await sql`
      SELECT q.text, q.source, q.context, q.user_reflection,
             e.name AS entity_name, e.type AS entity_type, e.description AS entity_description
      FROM quotes q
      JOIN entities e ON e.id = q.entity_id
      WHERE q.id = ${id} AND q.deleted_at IS NULL AND e.deleted_at IS NULL
    `) as Row[]
    if (rows.length === 0) {
      return new Response('Cita no encontrada', { status: 404 })
    }
    const r = rows[0]

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
    })

    const invocation = await resolveAIInvocation(req, 'reflect')
    if (invocation.kind === 'off') return aiOffResponse()

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
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
        ) VALUES (
          ${`reflect:${id}`},
          ${JSON.stringify({ reflection })}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.durationMs}
        )
      `.catch(() => {})

      return Response.json({
        reflection,
        provider: usage.provider,
        model: usage.model,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
    }
  },
)

export const config: Config = {
  path: '/api/quotes/:id/reflect',
}
