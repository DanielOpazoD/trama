import type { Config, Context } from '@netlify/functions'
import { z } from 'zod'
import { getSql } from './_lib/db.js'
import { askLLMForText } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildVozMessages } from './_lib/voz-prompt.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { parseJsonBody } from './_lib/zod-body.js'

/**
 * POST /api/entities/:id/voz
 *
 * "Voz de…": dada una entidad con al menos 5 citas reunidas, genera una
 * lectura activa —una voz especulativa en primera persona— a partir de ese
 * material y de un tema que pasa el usuario. NO persiste nada: es lectura.
 *
 * Contrato: es una hipótesis de voz construida desde un archivo parcial, NO
 * la persona real. El framing vive en el prompt y la UI lo rotula igual.
 */

const VozBody = z.object({
  question: z.string().trim().min(1, 'tema requerido').max(500),
})

/** Mínimo de citas para que la voz tenga sustrato suficiente. */
const MIN_QUOTES = 5
/** Tope de citas que pasamos como contexto, para acotar el prompt. */
const MAX_QUOTES = 40

export default withObservability(
  'voz',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const id = context.params.id
    if (!id) return ApiErrors.validation(requestId, 'id requerido')

    const parsed = await parseJsonBody(req, VozBody, requestId)
    if (!parsed.ok) return parsed.response
    const { question } = parsed.data

    const { id: userId } = await getAuthedUser(req)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    const sql = getSql()

    type EntityRow = { name: string; type: string; description: string | null }
    const entityRows = (await sql`
      SELECT name, type, description
      FROM entities
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    `) as EntityRow[]
    if (entityRows.length === 0) {
      return ApiErrors.notFound(requestId, 'Entidad no encontrada')
    }
    const entity = entityRows[0]

    type QuoteRow = { text: string; source: string | null }
    const quoteRows = (await sql`
      SELECT text, source
      FROM quotes
      WHERE entity_id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${MAX_QUOTES}
    `) as QuoteRow[]

    if (quoteRows.length < MIN_QUOTES) {
      return ApiErrors.unprocessable(
        requestId,
        `La voz necesita al menos ${MIN_QUOTES} citas reunidas de esta entidad; hay ${quoteRows.length}.`,
      )
    }

    const messages = buildVozMessages({
      entityName: entity.name,
      entityType: entity.type,
      entityDescription: entity.description,
      quotes: quoteRows.map((q) => ({ text: q.text, source: q.source })),
      question,
    })

    const invocation = await resolveAIInvocation(req, 'voz', userId)
    if (invocation.kind === 'off') return aiOffResponse()

    try {
      const { content, usage, fromCache } = await askLLMForText(messages, {
        provider: invocation.provider,
        model: invocation.model,
      })
      const voice = typeof content === 'string' ? content.trim() : String(content).trim()

      logEvent({
        event: 'voz_completed',
        entityId: id,
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
          ${`voz:${id}`},
          ${JSON.stringify({ question, voice })}::jsonb,
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
        voice,
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
  path: '/api/entities/:id/voz',
}
