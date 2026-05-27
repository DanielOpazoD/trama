/**
 * Monthly cost cap for LLM calls.
 *
 * Reads `AI_MONTHLY_BUDGET_CENTS` env var (default 500 = $5/month).
 * Queries extraction_log for accumulated cost in the current month.
 * Returns null if under budget, or a Response (429) if over.
 *
 * **Multi-user nota**: hoy el cap es global (env var compartida por
 * todos los usuarios). Cuando la app pase a multi-user serio, mover
 * a una columna `monthly_budget_cents` en la tabla `users` y filtrar
 * la suma del extraction_log por `user_id`. La forma del check no
 * cambia — solo el query.
 *
 * **Fail-open** intencional: si no hay DB (modo local sin Netlify),
 * dejamos pasar. El cap es una contención de gasto, no security; un
 * usuario dev no debería bloquearse por no tener Postgres provisionado.
 *
 * @example
 *   const overBudget = await checkMonthlyBudget()
 *   if (overBudget) return overBudget  // 429 al cliente
 *   // ... continuar con llamada al LLM
 */

import { safeSql } from './observability.js'

function readBudgetCents(): number {
  const raw = Netlify.env.get('AI_MONTHLY_BUDGET_CENTS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 500 // default $5/month
}

export async function checkMonthlyBudget(): Promise<Response | null> {
  const sql = safeSql()
  if (!sql) return null // No DB → can't check, fail open.
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
