import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getEnv } from './_lib/env.js'

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
export default withObservability('health', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
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

  type ErrorCountRow = { c: string }
  type EmbeddingPendingRow = { entities: string; quotes: string }
  type DailyCostRow = { day: string; cost_cents: string; calls: string }

  const [
    entitiesCountRows,
    quotesCountRows,
    relsCountRows,
    monthTotalsRows,
    providerRows,
    errorRows,
    errors24hRows,
    embeddingPendingRows,
    dailyCostRows,
  ] = await Promise.all([
    sqlTyped<CountRow>(sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL`),
    sqlTyped<CountRow>(sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL`),
    sqlTyped<CountRow>(sql`SELECT COUNT(*)::text AS c FROM relationships WHERE deleted_at IS NULL`),
    sqlTyped<MonthTotalsRow>(sql`
      SELECT
        COUNT(*)::text AS calls,
        COALESCE(SUM(tokens_in), 0)::text AS tokens_in,
        COALESCE(SUM(tokens_out), 0)::text AS tokens_out,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents
      FROM extraction_log
      WHERE created_at >= date_trunc('month', NOW())
    `),
    sqlTyped<ProviderRow>(sql`
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
    `),
    sqlTyped<ErrorRow>(sql`
      SELECT id, function_name, http_method, http_path, status_code, message, created_at
      FROM error_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 10
    `),
    // Errores en las últimas 24h — para alertar de "algo está pasando ahora"
    // vs el histórico de 7 días.
    sqlTyped<ErrorCountRow>(sql`
      SELECT COUNT(*)::text AS c
      FROM error_log
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `),
    // Filas sin embedding — alertar cuando vale la pena reindexar.
    sqlTyped<EmbeddingPendingRow>(sql`
      SELECT
        (SELECT COUNT(*) FROM entities WHERE deleted_at IS NULL AND embedding IS NULL)::text AS entities,
        (SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL AND embedding IS NULL)::text AS quotes
    `),
    // Serie diaria de costo IA — para sparklines en Health.
    // Últimos 30 días, agrupados por día. Días sin actividad no aparecen
    // en el resultado (se rellenan a 0 en el cliente).
    sqlTyped<DailyCostRow>(sql`
      SELECT
        date_trunc('day', created_at)::date::text AS day,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents,
        COUNT(*)::text AS calls
      FROM extraction_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `),
  ])

  // O1: lee via getEnv() para evitar Netlify.env.get directo.
  // Default 5000 si la env var no está seteada o es inválida.
  const budgetCents = getEnv().AI_MONTHLY_BUDGET_CENTS ?? 5000
  const monthCostCents = Number(monthTotalsRows[0]?.cost_cents ?? 0)
  const budgetPct = budgetCents > 0 ? Math.min(1, monthCostCents / budgetCents) : 0

  // ── Alertas calculadas en runtime ──────────────────────────────
  // Cada alerta es algo que el usuario debería mirar. Tres severidades:
  //   info  — útil saber, no urgente (gradient azul muy sutil)
  //   warn  — vale la pena revisar (ámbar)
  //   error — algo está fallando ahora (rojo)
  // La UI consume `alerts[]` para decidir si pinta un dot en el sidebar
  // y de qué color. Si el array está vacío, todo silencioso.
  type Alert = {
    severity: 'info' | 'warn' | 'error'
    code: string
    label: string
    hint: string
  }
  const alerts: Alert[] = []

  // Budget — alerta antes de tocar el cap, para que el usuario pueda
  // decidir si subir el cap o pausar antes de que se corten las llamadas.
  if (budgetPct >= 0.9) {
    alerts.push({
      severity: 'error',
      code: 'budget_critical',
      label: 'Gasto IA al 90% del cap',
      hint: 'Próximamente las llamadas LLM van a bloquearse hasta el próximo mes. Sube AI_MONTHLY_BUDGET_CENTS o pausa flujos.',
    })
  } else if (budgetPct >= 0.7) {
    alerts.push({
      severity: 'warn',
      code: 'budget_high',
      label: `Gasto IA al ${Math.round(budgetPct * 100)}% del cap`,
      hint: 'Vas por encima del 70% del presupuesto mensual. Mira el breakdown por provider abajo.',
    })
  }

  // Errores recientes — el "hubo algo raro en las últimas 24h".
  const errors24h = Number(errors24hRows[0]?.c ?? 0)
  if (errors24h >= 10) {
    alerts.push({
      severity: 'error',
      code: 'errors_burst',
      label: `${errors24h} errores en 24h`,
      hint: 'Algo está fallando recurrente. Mira la lista de abajo y los stacks.',
    })
  } else if (errors24h >= 3) {
    alerts.push({
      severity: 'warn',
      code: 'errors_recent',
      label: `${errors24h} errores en 24h`,
      hint: 'Hay más errores de los habituales. Vale la pena una mirada.',
    })
  }

  // Embeddings sin indexar — info, no urgente. Aparece solo si hay un
  // backlog significativo (>50). Por debajo no vale interrumpir.
  const pendingEntities = Number(embeddingPendingRows[0]?.entities ?? 0)
  const pendingQuotes = Number(embeddingPendingRows[0]?.quotes ?? 0)
  const pendingTotal = pendingEntities + pendingQuotes
  if (pendingTotal >= 50) {
    alerts.push({
      severity: 'info',
      code: 'embeddings_pending',
      label: `${pendingTotal} sin indexar`,
      hint: 'Búsqueda semántica no las cubre todavía. Reindexa desde la sección Búsqueda.',
    })
  }

  // Serie diaria de los últimos 30 días — rellenamos días sin
  // actividad con 0 para que el sparkline se vea como una línea
  // continua. El cliente espera `dailyCost: { day, costCents, calls }[]`
  // de longitud 30, ordenado del día más viejo al más reciente.
  const dailyMap = new Map<string, { cost: number; calls: number }>()
  for (const r of dailyCostRows) {
    dailyMap.set(r.day, {
      cost: Number(r.cost_cents),
      calls: Number(r.calls),
    })
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dailyCost: Array<{ day: string; costCents: number; calls: number }> = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dayStr = d.toISOString().slice(0, 10)
    const found = dailyMap.get(dayStr)
    dailyCost.push({
      day: dayStr,
      costCents: found?.cost ?? 0,
      calls: found?.calls ?? 0,
    })
  }

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
      pct: budgetPct,
    },
    alerts,
    embeddings: {
      pendingEntities,
      pendingQuotes,
    },
    dailyCost,
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
