import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { askLLMForText } from './_lib/llm.js'
import {
  buildBookmarkCronicaMessages,
  getLatestXCronica,
  insertXCronica,
  selectBookmarksForCronica,
  type StoredXCronica,
} from './_lib/x/index.js'

/**
 * /api/x/cronica
 *   GET  → la crónica de bookmarks más reciente (o null).
 *   POST → genera una crónica nueva a partir de los bookmarks recientes y la
 *          persiste. Respeta cost-cap + modo IA. Exige ≥5 bookmarks (422 si no).
 */
const MATERIAL_LIMIT = 80
const MIN_BOOKMARKS = 5

function toCamel(c: StoredXCronica) {
  return {
    id: c.id,
    text: c.text,
    sourceCount: c.source_count,
    generatedAt: c.generated_at,
    provider: c.provider,
    model: c.model,
  }
}

export default withObservability(
  'x-cronica',
  async (req: Request, _ctx: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    if (req.method === 'GET') {
      const latest = await getLatestXCronica(sql, userId)
      return Response.json({ cronica: latest ? toCamel(latest) : null })
    }
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    const bookmarks = await selectBookmarksForCronica(sql, userId, MATERIAL_LIMIT)
    if (bookmarks.length < MIN_BOOKMARKS) {
      return ApiErrors.unprocessable(
        requestId,
        `Necesitás al menos ${MIN_BOOKMARKS} bookmarks para una crónica (tenés ${bookmarks.length}).`,
      )
    }

    const invocation = await resolveAIInvocation(req, 'reflect', userId)
    if (invocation.kind === 'off') return aiOffResponse()

    try {
      const messages = buildBookmarkCronicaMessages(bookmarks)
      const { content, usage, fromCache } = await askLLMForText(messages, {
        provider: invocation.provider,
        model: invocation.model,
      })
      const text =
        typeof content === 'string' ? content.trim() : String(content).trim()

      const row = await insertXCronica(sql, userId, {
        text,
        sourceCount: bookmarks.length,
        provider: usage.provider,
        model: usage.model,
      })

      logEvent({
        event: 'x_cronica_generated',
        sources: bookmarks.length,
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
          ${'x-cronica'}, ${JSON.stringify({ sources: bookmarks.length })}::jsonb,
          ${usage.provider}, ${usage.model},
          ${usage.tokensIn}, ${usage.tokensOut}, ${usage.costCents}, ${usage.durationMs},
          ${userId}
        )
      `.catch(() => {})

      return Response.json({ cronica: toCamel(row) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return ApiErrors.upstream(requestId, `Error generando la crónica: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/x/cronica',
}
