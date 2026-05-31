/**
 * Monthly cost cap for LLM calls.
 *
 * Per-user: la migración 20260527 agregó `users.monthly_budget_cents`.
 * El check usa ese cap individual (o cae a la env var si la columna es NULL)
 * y filtra `extraction_log` por user_id. En modo single-user, el caller pasa
 * `legacy-single-user` desde getAuthedUser().
 *
 * Fallbacks:
 *   - env var `AI_MONTHLY_BUDGET_CENTS` (default 5000 = $50/month)
 *   - `users.monthly_budget_cents` si existe ese row (default null →
 *     env var)
 *
 * **Fail-open** intencional: si no hay DB (modo local sin Netlify),
 * dejamos pasar. El cap es contención de gasto, no security; un
 * dev no debería bloquearse por no tener Postgres provisionado.
 *
 * @example
 *   // multi-user (recomendado): cap del usuario + gasto solo suyo
 *   const { id: userId } = await getAuthedUser(req)
 *   const overBudget = await checkMonthlyBudget(userId, requestId)
 *   if (overBudget) return overBudget
 */

import { safeSql } from './observability.js'
import { ApiErrors } from './api-error.js'
import { getEnv } from './env.js'
import { sqlTyped } from './db.js'

type UserBudgetRow = {
  cap: number | null
}

type MonthlySpendRow = {
  total: string
}

function readEnvBudgetCents(): number {
  // N4: vía getEnv() en lugar de Netlify.env.get directo. El parsing
  // numérico está centralizado en env.ts; acá solo aplicamos el default.
  const value = getEnv().AI_MONTHLY_BUDGET_CENTS
  return typeof value === 'number' && value > 0 ? value : 5000 // default $50/month
}

export async function checkMonthlyBudget(
  userId: string,
  requestId: string,
): Promise<Response | null> {
  const sql = safeSql()
  if (!sql) return null // No DB → can't check, fail open.

  const envBudget = readEnvBudgetCents()

  // Per-user mode: leer cap del row de users, fallback a env var.
  let budget = envBudget
  try {
    const rows = await sqlTyped<UserBudgetRow>(sql`
      SELECT monthly_budget_cents AS cap
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `)
    const userCap = rows[0]?.cap
    if (typeof userCap === 'number' && userCap > 0) {
      budget = userCap
    }
  } catch {
    // tabla users no existe todavía (migración no aplicada) o el
    // user no está en la tabla — fallback al env var sin romper.
  }

  const rows = await sqlTyped<MonthlySpendRow>(sql`
    SELECT COALESCE(SUM(cost_cents), 0) AS total
    FROM extraction_log
    WHERE created_at >= date_trunc('month', NOW())
      AND user_id = ${userId}
  `)

  const spentCents = Number(rows[0]?.total ?? 0)
  if (spentCents >= budget) {
    // FF3: shape canónico {error: {code, message, requestId, details}}
    // — antes devolvíamos `new Response(text, 429)` con cuerpo plano y
    // el cliente tenía que parsear distinto. Ahora el detalle viaja
    // estructurado en `details` (budgetCents + spentCents).
    return ApiErrors.rateLimited(
      requestId,
      `Presupuesto mensual del LLM agotado (gastado ${spentCents.toFixed(2)} centavos de un cap de ${budget}). Aumenta AI_MONTHLY_BUDGET_CENTS o espera al próximo mes.`,
      { budgetCents: budget, spentCents },
    )
  }
  return null
}
