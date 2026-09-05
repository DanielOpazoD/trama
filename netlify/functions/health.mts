import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getEnv } from './_lib/env.js'
import { runWithUserRls } from './_lib/user-rls.js'
import { buildHealthAlerts, deriveHealthStatus } from './_lib/health-alerts.js'
import { summarizeWebVitals, type WebVitalRow } from './_lib/web-vitals-summary.js'

export type HealthAuthStatus = {
  clerkConfigured: boolean
  legacyFallbackAllowed: boolean
  legacyOwnerMapped: boolean
  mode: 'legacy-single-user' | 'clerk-with-legacy-fallback' | 'clerk'
}

export function resolveHealthAuthStatus(env = getEnv()): HealthAuthStatus {
  return {
    clerkConfigured: Boolean(env.CLERK_SECRET_KEY),
    legacyFallbackAllowed: env.ALLOW_LEGACY_FALLBACK,
    legacyOwnerMapped: Boolean(env.LEGACY_OWNER_CLERK_ID),
    mode: !env.CLERK_SECRET_KEY
      ? 'legacy-single-user'
      : env.ALLOW_LEGACY_FALLBACK
        ? 'clerk-with-legacy-fallback'
        : 'clerk',
  }
}

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
  // Multi-user: Health es per-usuario. TODO conteo/costo/error se filtra por
  // user_id — sin esto, un usuario vería los agregados globales de la trama.
  const { id: userId } = await getAuthedUser(req, {
    requestId,
    operation: 'health.read',
  })
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
  type UserBudgetRow = { cap: number | null }

  const [
    userBudgetRows,
    entitiesCountRows,
    quotesCountRows,
    relsCountRows,
    monthTotalsRows,
    providerRows,
    errorRows,
    errors24hRows,
    embeddingPendingRows,
    dailyCostRows,
    webVitalRows,
  ] = (await runWithUserRls(sql, userId, (scoped) => [
    scoped`
      SELECT monthly_budget_cents AS cap
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `,
    scoped`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL AND user_id = ${userId}`,
    scoped`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL AND user_id = ${userId}`,
    scoped`SELECT COUNT(*)::text AS c FROM relationships WHERE deleted_at IS NULL AND user_id = ${userId}`,
    scoped`
      SELECT
        COUNT(*)::text AS calls,
        COALESCE(SUM(tokens_in), 0)::text AS tokens_in,
        COALESCE(SUM(tokens_out), 0)::text AS tokens_out,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents
      FROM extraction_log
      WHERE created_at >= date_trunc('month', NOW())
        AND user_id = ${userId}
    `,
    scoped`
      SELECT
        provider,
        model,
        COUNT(*)::text AS calls,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents
      FROM extraction_log
      WHERE created_at >= date_trunc('month', NOW())
        AND provider IS NOT NULL
        AND user_id = ${userId}
      GROUP BY provider, model
      ORDER BY cost_cents DESC
      LIMIT 10
    `,
    scoped`
      SELECT id, function_name, http_method, http_path, status_code, message, created_at
      FROM error_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 10
    `,
    // Errores en las últimas 24h — para alertar de "algo está pasando ahora"
    // vs el histórico de 7 días.
    scoped`
      SELECT COUNT(*)::text AS c
      FROM error_log
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND user_id = ${userId}
    `,
    // Filas sin embedding — alertar cuando vale la pena reindexar.
    scoped`
      SELECT
        (SELECT COUNT(*) FROM entities WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId})::text AS entities,
        (SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId})::text AS quotes
    `,
    // Serie diaria de costo IA — para sparklines en Health.
    // Últimos 30 días, agrupados por día. Días sin actividad no aparecen
    // en el resultado (se rellenan a 0 en el cliente).
    scoped`
      SELECT
        date_trunc('day', created_at)::date::text AS day,
        COALESCE(SUM(cost_cents), 0)::text AS cost_cents,
        COUNT(*)::text AS calls
      FROM extraction_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND user_id = ${userId}
      GROUP BY day
      ORDER BY day ASC
    `,
    // Core Web Vitals: p75 por métrica a 7 y 28 días. Postgres calcula el
    // percentil; el semáforo lo decide `web-vitals-summary.ts`.
    scoped`
      SELECT
        metric,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value)
          FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS p75_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS samples_7d,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75_28d,
        COUNT(*)::text AS samples_28d
      FROM web_vitals_samples
      WHERE created_at >= NOW() - INTERVAL '28 days'
        AND user_id = ${userId}
        AND metric IN ('LCP', 'INP', 'CLS')
      GROUP BY metric
    `,
  ])) as [
    UserBudgetRow[],
    CountRow[],
    CountRow[],
    CountRow[],
    MonthTotalsRow[],
    ProviderRow[],
    ErrorRow[],
    ErrorCountRow[],
    EmbeddingPendingRow[],
    DailyCostRow[],
    WebVitalRow[],
  ]

  // Health debe mostrar el mismo cap que aplica cost-cap.ts:
  // users.monthly_budget_cents si existe, fallback a AI_MONTHLY_BUDGET_CENTS.
  const env = getEnv()
  const envBudgetCents = env.AI_MONTHLY_BUDGET_CENTS ?? 5000
  const userBudgetCents = userBudgetRows[0]?.cap
  const budgetCents =
    typeof userBudgetCents === 'number' && userBudgetCents > 0
      ? userBudgetCents
      : envBudgetCents
  const monthCostCents = Number(monthTotalsRows[0]?.cost_cents ?? 0)
  const budgetPct = budgetCents > 0 ? Math.min(1, monthCostCents / budgetCents) : 0
  const auth = resolveHealthAuthStatus(env)

  // ── Alertas calculadas en runtime ──────────────────────────────
  // La clasificación (umbrales + severidad + copy) vive en una función
  // PURA y testeable: `buildHealthAlerts` en `_lib/health-alerts.ts`.
  // Acá solo armamos las señales a partir de lecturas baratas que el
  // handler ya hizo y delegamos la decisión. La UI consume `alerts[]`
  // para decidir si pinta un dot en el sidebar y de qué color; si el
  // array está vacío, todo silencioso. NUNCA metemos datos sensibles en
  // las señales: son conteos/fracciones, nunca contenido de error.
  const pendingEntities = Number(embeddingPendingRows[0]?.entities ?? 0)
  const pendingQuotes = Number(embeddingPendingRows[0]?.quotes ?? 0)
  const errors24h = Number(errors24hRows[0]?.c ?? 0)
  const webVitals = summarizeWebVitals(webVitalRows)
  const alerts = buildHealthAlerts({
    budgetPct,
    errors24h,
    pendingEmbeddings: pendingEntities + pendingQuotes,
    clerkConfigured: auth.clerkConfigured,
    legacyFallbackAllowed: auth.legacyFallbackAllowed,
    webVitalsPoor: webVitals.filter((v) => v.rating === 'poor').map((v) => v.metric),
  })
  // Estado global derivado (additive): ok / degraded / critical.
  const status = deriveHealthStatus(alerts)

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
    auth,
    operational: {
      requestId,
      databaseReachable: true,
      runtimeApiRoutesContract: 'check:runtime-api-routes',
      productionSmokeCommand: 'npm run smoke:production-report',
      legacyDataReassignmentCommand:
        'npm run legacy-data-reassignment:dry-run -- --markdown',
      logRedaction: 'structured-redaction',
    },
    status,
    alerts,
    embeddings: {
      pendingEntities,
      pendingQuotes,
    },
    dailyCost,
    webVitals,
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
