/**
 * Monthly cost cap for LLM calls.
 *
 * Reads `AI_MONTHLY_BUDGET_CENTS` env var (default 500 = $5/month).
 * Queries extraction_log for accumulated cost in the current month.
 * Returns null if under budget, or a Response (429) if over.
 */

import { neon } from '@neondatabase/serverless'

function readBudgetCents(): number {
  const raw = Netlify.env.get('AI_MONTHLY_BUDGET_CENTS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 500 // default $5/month
}

export async function checkMonthlyBudget(): Promise<Response | null> {
  const url = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!url) return null // No DB → can't check, fail open.
  const sql = neon(url)
  const budget = readBudgetCents()

  type Row = { total: string }
  const rows = (await sql`
    SELECT COALESCE(SUM(cost_cents), 0) AS total
    FROM extraction_log
    WHERE created_at >= date_trunc('month', NOW())
  `) as Row[]

  const spentCents = Number(rows[0]?.total ?? 0)
  if (spentCents >= budget) {
    return new Response(
      `Presupuesto mensual del LLM agotado (gastado ${spentCents.toFixed(2)} centavos de un cap de ${budget}). Aumenta AI_MONTHLY_BUDGET_CENTS o espera al próximo mes.`,
      {
        status: 429,
        headers: {
          'X-Budget-Limit': String(budget),
          'X-Budget-Spent': spentCents.toFixed(4),
        },
      },
    )
  }
  return null
}
