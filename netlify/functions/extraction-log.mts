import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

export default withObservability('extraction-log', async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sql = getSql()

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)

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

  const rows = (await sql`
    SELECT id, input_text, proposal, provider, model, tokens_in, tokens_out,
           cost_cents, duration_ms, error, created_at
    FROM extraction_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Row[]

  const totals = (await sql`
    SELECT
      COUNT(*) AS total_calls,
      COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
      COALESCE(SUM(tokens_in + tokens_out), 0) AS total_tokens
    FROM extraction_log
  `) as Array<{ total_calls: string; total_cost_cents: string; total_tokens: string }>

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
})

export const config: Config = {
  path: '/api/extraction-log',
}
