import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * Endpoint de "salud" para el panel de Settings → Health.
 *
 * Agrega en una sola query lo que el usuario quiere ver sin abrir
 * consolas externas:
 *   - Costo IA del mes actual (extraction_log filtrado por created_at)
 *   - Budget configurado vs restante
 *   - Errores recientes (últimos 10 del error_log)
 *   - Counts de la trama
 *   - Breakdown por provider en el mes
 *
 * Lo mantenemos en UN endpoint para que el componente Health solo haga
 * un fetch y se actualice como bloque.
 */
export default withObservability('health', async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sql = getSql()

  type CountRow = { c: string }
  type MonthTotalsRow = {
    calls: string
    tokens_in: string
    tokens_out: string
    cost_cents: string
  }
  type ProviderRow = {
    provider: string
    model: string
    calls: string
    cost_cents: string
  }
  type ErrorRow = {
    id: string
    function_name: string
    http_method: string | null
    http_path: string | null
    status_code: number | null
    message: string
    created_at: string
  }

  const [
    entitiesCountRows,
    quotesCountRows,
    relsCountRows,
    monthTotalsRows,
    providerRows,
    errorRows,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL` as unknown as Promise<CountRow[]>,
    sql`SELECT COUNT(*)::text AS c FROM relationships WHERE deleted_at IS NULL` as unknown as Promise<CountRow[]>,
    sql`
      SELECT
        COUNT(*)::text AS calls,
        COALESCE(SUM(tokens_in), 0)::text AS tokens_in,
        COALESCE(SUM(tokens_out), 0)::text AS tokens_out,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents
      FROM extraction_log
      WHERE created_at >= date_trunc('month', NOW())
    ` as unknown as Promise<MonthTotalsRow[]>,
    sql`
      SELECT
        provider,
        model,
        COUNT(*)::text AS calls,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents
      FROM extraction_log
      WHERE created_at >= date_trunc('month', NOW())
        AND provider IS NOT NULL
      GROUP BY provider, model
      ORDER BY cost_cents DESC
      LIMIT 10
    ` as unknown as Promise<ProviderRow[]>,
    sql`
      SELECT id, function_name, http_method, http_path, status_code, message, created_at
      FROM error_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 10
    ` as unknown as Promise<ErrorRow[]>,
  ])

  // Read the configured monthly budget; default 5000 cents if unset.
  const budgetCentsRaw = Netlify.env.get('AI_MONTHLY_BUDGET_CENTS')
  const budgetCents = budgetCentsRaw ? Number.parseFloat(budgetCentsRaw) : 5000
  const monthCostCents = Number(monthTotalsRows[0]?.cost_cents ?? 0)

  return Response.json({
    counts: {
      entities: Number(entitiesCountRows[0]?.c ?? 0),
      quotes: Number(quotesCountRows[0]?.c ?? 0),
      relationships: Number(relsCountRows[0]?.c ?? 0),
    },
    month: {
      calls: Number(monthTotalsRows[0]?.calls ?? 0),
      tokensIn: Number(monthTotalsRows[0]?.tokens_in ?? 0),
      tokensOut: Number(monthTotalsRows[0]?.tokens_out ?? 0),
      costCents: monthCostCents,
    },
    budget: {
      limitCents: budgetCents,
      remainingCents: Math.max(0, budgetCents - monthCostCents),
      pct: budgetCents > 0 ? Math.min(1, monthCostCents / budgetCents) : 0,
    },
    byProvider: providerRows.map((r) => ({
      provider: r.provider,
      model: r.model,
      calls: Number(r.calls),
      costCents: Number(r.cost_cents),
    })),
    recentErrors: errorRows.map((r) => ({
      id: r.id,
      functionName: r.function_name,
      httpMethod: r.http_method,
      httpPath: r.http_path,
      statusCode: r.status_code,
      message: r.message,
      createdAt: r.created_at,
    })),
  })
})

export const config: Config = {
  path: '/api/health',
}
