import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { logEvent, logErrorEvent } from './_lib/observability.js'
import { getEnv } from './_lib/env.js'
import { ApiErrors } from './_lib/api-error.js'

/**
 * DD7 (audit #6): scheduled function que avisa cuando el gasto IA mensual
 * se acerca al cap.
 *
 * Corre todos los días a las 12:00 UTC. Lee el gasto acumulado del mes
 * por usuario desde extraction_log y compara contra users.monthly_budget_cents
 * (fallback a AI_MONTHLY_BUDGET_CENTS). Si un usuario cruza el umbral
 * (default 80%) y no se envió alerta para ese user en las últimas 24 horas,
 * hace POST al webhook configurado.
 *
 * Antes este chequeo solo existía en el HealthPanel — había que abrir
 * Settings manualmente para verlo. Ahora llega activamente.
 *
 * Configuración (env vars):
 *   AI_MONTHLY_BUDGET_CENTS    → cap mensual fallback (default 5000 = $50)
 *   COST_ALERT_THRESHOLD_PCT   → 0..1, default 0.80 (80%)
 *   COST_ALERT_WEBHOOK_URL     → endpoint que recibe el POST. Compatible
 *                                 con Slack incoming-webhooks, Discord,
 *                                 ntfy.sh, o cualquier endpoint que
 *                                 acepte { text } en el body.
 *
 * Si COST_ALERT_WEBHOOK_URL no está configurado, el job corre igual
 * pero sólo loguea el evento (útil para verificar que el threshold
 * está bien calibrado antes de configurar el webhook real).
 */

function readBudgetCents(): number {
  // O1: getEnv() ya coerce y valida.
  const v = getEnv().AI_MONTHLY_BUDGET_CENTS
  return typeof v === 'number' && v > 0 ? v : 5000
}

function readThreshold(): number {
  // O1: el schema declara COST_ALERT_THRESHOLD_PCT como number coerced.
  // Validamos 0 < n <= 1 (porcentaje); fuera de rango → default 0.8.
  const v = getEnv().COST_ALERT_THRESHOLD_PCT
  return typeof v === 'number' && v > 0 && v <= 1 ? v : 0.8
}

const ALERT_CODE_PREFIX = 'cost-cap-warning'
const REALERT_AFTER_HOURS = 24

function alertCodeForUser(userId: string): string {
  return `${ALERT_CODE_PREFIX}:${userId}`
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(crypto.randomUUID())
  }

  let sql: ReturnType<typeof getSql>
  try {
    sql = getSql()
  } catch (err) {
    logErrorEvent({
      event: 'cost_alert_skipped',
      reason: 'no_db',
      message: err instanceof Error ? err.message : String(err),
    })
    return new Response(null, { status: 202 })
  }

  const fallbackBudget = readBudgetCents()
  const threshold = readThreshold()

  // Gasto del mes actual por usuario (igual que cost-cap.ts, pero batch).
  type Row = { user_id: string; total: string; monthly_budget_cents: number | null }
  const rows = (await sql`
    WITH monthly_spend AS (
      SELECT user_id, COALESCE(SUM(cost_cents), 0) AS total
      FROM extraction_log
      WHERE created_at >= date_trunc('month', NOW())
      GROUP BY user_id
    )
    SELECT
      s.user_id,
      s.total::text AS total,
      u.monthly_budget_cents
    FROM monthly_spend s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.total DESC
  `) as Row[]

  if (rows.length === 0) {
    logEvent({
      event: 'cost_alert_check_ok',
      usersChecked: 0,
    })
    return new Response(null, { status: 202 })
  }

  let alerted = 0
  let throttled = 0
  let belowThreshold = 0
  const webhookUrl = getEnv().COST_ALERT_WEBHOOK_URL

  for (const row of rows) {
    const userId = row.user_id
    const spentCents = Number(row.total ?? 0)
    const userBudget =
      typeof row.monthly_budget_cents === 'number' && row.monthly_budget_cents > 0
        ? row.monthly_budget_cents
        : fallbackBudget
    const pct = userBudget > 0 ? spentCents / userBudget : 0
    const alertCode = alertCodeForUser(userId)

    // Bajo el threshold — limpiamos la alerta de ese usuario para que la
    // próxima vez que cruce se vuelva a notificar.
    if (pct < threshold) {
      belowThreshold += 1
      await sql`DELETE FROM alert_state WHERE code = ${alertCode}`
      continue
    }

    // Sobre el threshold — ¿ya avisamos recientemente para este usuario?
    type StateRow = { last_sent_at: string }
    const state = (await sql`
      SELECT last_sent_at FROM alert_state WHERE code = ${alertCode}
    `) as StateRow[]
    const lastSent = state[0]?.last_sent_at ? new Date(state[0].last_sent_at) : null
    const hoursSince = lastSent ? (Date.now() - lastSent.getTime()) / 3_600_000 : Infinity

    if (hoursSince < REALERT_AFTER_HOURS) {
      throttled += 1
      logEvent({
        event: 'cost_alert_throttled',
        userId,
        pct: Number(pct.toFixed(3)),
        hoursSinceLast: Number(hoursSince.toFixed(1)),
      })
      continue
    }

    // Disparar la alerta. Webhook payload compatible con Slack/Discord/ntfy:
    // todos aceptan { text }; Slack además acepta blocks, los obviamos.
    const usdSpent = (spentCents / 100).toFixed(2)
    const usdBudget = (userBudget / 100).toFixed(2)
    const pctDisplay = Math.round(pct * 100)
    const message = `Trama LLM — ${userId} lleva ${pctDisplay}% del cap mensual. USD ${usdSpent} de ${usdBudget}. Revisa Settings → Estado del sistema o ajusta users.monthly_budget_cents / AI_MONTHLY_BUDGET_CENTS.`

    if (webhookUrl) {
      try {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, userId, spentCents, budgetCents: userBudget }),
        })
        if (!resp.ok) {
          const body = await resp.text().catch(() => '')
          logErrorEvent({
            event: 'cost_alert_webhook_failed',
            userId,
            status: resp.status,
            message: body.slice(0, 500),
          })
        } else {
          logEvent({ event: 'cost_alert_webhook_sent', userId, pct: pctDisplay })
        }
      } catch (err) {
        logErrorEvent({
          event: 'cost_alert_webhook_error',
          userId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    } else {
      logEvent({
        event: 'cost_alert_no_webhook',
        message: 'COST_ALERT_WEBHOOK_URL no configurado — alerta no enviada',
        userId,
        pct: pctDisplay,
      })
    }

    // Persistir el envío aunque el webhook falle — evita spam si está
    // permanentemente roto. Si se quiere re-disparar manualmente, DELETE del
    // row `cost-cap-warning:<userId>`.
    await sql`
      INSERT INTO alert_state (code, last_sent_at, payload)
      VALUES (
        ${alertCode},
        NOW(),
        ${JSON.stringify({ userId, spentCents, budget: userBudget, pct, message })}::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET
        last_sent_at = NOW(),
        payload = EXCLUDED.payload
    `
    alerted += 1
  }

  logEvent({
    event: 'cost_alert_check_completed',
    usersChecked: rows.length,
    belowThreshold,
    throttled,
    alerted,
  })

  return new Response(null, { status: 202 })
}

export const config: Config = {
  // 12:00 UTC todos los días = 09:00 Chile (UTC-3) en verano,
  // 08:00 Chile en invierno. Hora razonable para que el usuario
  // vea la notificación al empezar el día.
  schedule: '0 12 * * *',
}
