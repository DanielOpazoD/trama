import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

type Row = {
  id: string
  input_text: string
  proposal: unknown
  provider: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_cents: string // numeric arrives as string
  duration_ms: number
  error: string | null
  created_at: string
}

type TotalsRow = {
  total_calls: string
  total_cost_cents: string
  total_tokens: string
}

/**
 * GET /api/extraction-log — devuelve los logs LLM del usuario actual.
 *
 * Privacidad: filtra por `user_id = ${userId}`. Sin este filtro, en
 * multi-user un usuario podría leer los `input_text` (queries de chat,
 * texto pegado para extracción, etc.) de cualquier otro. El backfill
 * 20260528 puso 'legacy-single-user' en rows huérfanos para que el
 * filtro no tenga que tolerar NULLs.
 */
export default withObservability(
  'extraction-log',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'GET') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)

    const rows = await sqlTyped<Row>(sql`
    SELECT id, input_text, proposal, provider, model, tokens_in, tokens_out,
           cost_cents, duration_ms, error, created_at
    FROM extraction_log
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)

    const totals = await sqlTyped<TotalsRow>(sql`
    SELECT
      COUNT(*) AS total_calls,
      COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
      COALESCE(SUM(tokens_in + tokens_out), 0) AS total_tokens
    FROM extraction_log
    WHERE user_id = ${userId}
  `)

    return Response.json({
      entries: rows.map((r) => ({
        id: r.id,
        inputText: r.input_text,
        proposal: r.proposal,
        provider: r.provider,
        model: r.model,
        tokensIn: r.tokens_in,
        tokensOut: r.tokens_out,
        costCents: Number(r.cost_cents),
        durationMs: r.duration_ms,
        error: r.error,
        createdAt: r.created_at,
      })),
      totals: {
        totalCalls: Number(totals[0]?.total_calls ?? 0),
        totalCostCents: Number(totals[0]?.total_cost_cents ?? 0),
        totalTokens: Number(totals[0]?.total_tokens ?? 0),
      },
    })
  },
)

export const config: Config = {
  path: '/api/extraction-log',
}
