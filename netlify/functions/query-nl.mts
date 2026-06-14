import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { logEvent } from './_lib/observability.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { resolveAIInvocation } from './_lib/ai-mode.js'
import { askLLMForJson } from './_lib/llm.js'
import { fallbackQuery, translateNl, type NlContext } from './_lib/query/nl.js'
import { runQuery } from './_lib/query/execute.js'

/**
 * Lenguaje natural → query (Fase 3). `POST /api/query/nl { q }` traduce la
 * pregunta del usuario a un AST (vía LLM con el catálogo data-driven), lo
 * ejecuta con el motor de queries y devuelve `{ query, items, nextCursor,
 * source }`. Devuelve el AST para que la UI muestre/edite la interpretación
 * ("live update view").
 *
 * Si la IA está off / sin presupuesto, o el LLM no produce un AST válido, cae a
 * una búsqueda de texto libre sobre todos los tipos — siempre hay resultados.
 */
const NlBody = z.object({ q: z.string().min(1).max(500) })

export default withObservability(
  'query-nl',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    // Escribimos extraction_log (cost-cap) con user_id → aseguramos la fila de
    // users antes (FK users(id)) por si es el primer login real.
    await ensureUserRow(sql, { id: userId })

    const parsed = await parseJsonBody(req, NlBody, requestId)
    if (!parsed.ok) return parsed.response
    const q = parsed.data.q

    // Catálogo data-driven para anclar al modelo en campos/tipos reales.
    const typeRows = await sqlTyped<{ slug: string }>(
      sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`,
    )
    const ctx: NlContext = {
      today: new Date().toISOString().slice(0, 10),
      entityTypes: typeRows.map((r) => r.slug),
    }

    // Guards de IA. Si off / sin presupuesto → fallback de texto libre sin LLM.
    const overBudget = await checkMonthlyBudget(userId, requestId)
    const invocation = overBudget
      ? ({ kind: 'off' } as const)
      : await resolveAIInvocation(req, 'classify', userId)

    let query
    let source: 'llm' | 'fallback'
    if (invocation.kind !== 'ready') {
      query = fallbackQuery(q)
      source = 'fallback'
    } else {
      const { provider, model } = invocation
      const ask = async (messages: Parameters<typeof askLLMForJson>[0]) => {
        const r = await askLLMForJson(messages, { provider, model })
        // Contabilizar el gasto para el cost-cap mensual (best-effort): el
        // budget suma extraction_log.cost_cents. Un cache hit cuesta 0.
        sql`
          INSERT INTO extraction_log (
            input_text, proposal, provider, model,
            tokens_in, tokens_out, cost_cents, duration_ms, user_id
          ) VALUES (
            ${`nl-query: ${q}`}, ${JSON.stringify(r.content ?? {})}::jsonb,
            ${r.usage.provider}, ${r.usage.model}, ${r.usage.tokensIn},
            ${r.usage.tokensOut}, ${r.fromCache ? 0 : r.usage.costCents},
            ${r.usage.durationMs}, ${userId}
          )
        `.catch(() => {})
        return { content: r.content }
      }
      const translated = await translateNl(q, ctx, ask)
      query = translated.query
      source = translated.source
    }

    const result = await runQuery(sql, query)
    logEvent({
      event: 'query_nl',
      source,
      kinds: query.from.join(','),
      count: result.items.length,
    })
    return Response.json({ query, ...result, source })
  },
)

export const config: Config = {
  path: '/api/query/nl',
}
