import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { logEvent, logErrorEvent } from './_lib/observability.js'

/**
 * DD7 (audit #6): scheduled function que avisa cuando el gasto IA mensual
 * se acerca al cap.
 *
 * Corre todos los días a las 12:00 UTC. Lee el gasto acumulado del mes
 * desde extraction_log y compara contra AI_MONTHLY_BUDGET_CENTS. Si el
 * porcentaje cruzó el umbral (default 80%) y no se envió alerta en las
 * últimas 24 horas, hace POST al webhook configurado.
 *
 * Antes este chequeo solo existía en el HealthPanel — había que abrir
 * Settings manualmente para verlo. Ahora llega activamente.
 *
 * Configuración (env vars):
 *   AI_MONTHLY_BUDGET_CENTS    → cap mensual (default 500 = $5)
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
  const raw = Netlify.env.get('AI_MONTHLY_BUDGET_CENTS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 500
}

function readThreshold(): number {
  const raw = Netlify.env.get('COST_ALERT_THRESHOLD_PCT')
  const n = raw ? parseFloat(raw) : NaN
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.8
}

const ALERT_CODE = 'cost-cap-warning'
const REALERT_AFTER_HOURS = 24

export default async (_req: Request) => {
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

  const budget = readBudgetCents()
  const threshold = readThreshold()

  // Gasto del mes actual (igual que health.mts y cost-cap.ts).
  type Row = { total: string }
  const rows = (await sql`
    SELECT COALESCE(SUM(cost_cents), 0) AS total
    FROM extraction_log
    WHERE created_at >= date_trunc('month', NOW())
  `) as Row[]
  const spentCents = Number(rows[0]?.total ?? 0)
  const pct = budget > 0 ? spentCents / budget : 0

  // Bajo el threshold — limpiamos cualquier alerta vieja para que la
  // próxima vez que cruce, se vuelva a notificar.
  if (pct < threshold) {
    await sql`DELETE FROM alert_state WHERE code = ${ALERT_CODE}`
    logEvent({
      event: 'cost_alert_check_ok',
      pct: Number(pct.toFixed(3)),
      spentCents: Number(spentCents.toFixed(2)),
      budgetCents: budget,
    })
    return new Response(null, { status: 202 })
  }

  // Sobre el threshold — ¿ya avisamos recientemente?
  type StateRow = { last_sent_at: string }
  const state = (await sql`
    SELECT last_sent_at FROM alert_state WHERE code = ${ALERT_CODE}
  `) as StateRow[]
  const lastSent = state[0]?.last_sent_at ? new Date(state[0].last_sent_at) : null
  const hoursSince = lastSent ? (Date.now() - lastSent.getTime()) / 3_600_000 : Infinity

  if (hoursSince < REALERT_AFTER_HOURS) {
    logEvent({
      event: 'cost_alert_throttled',
      pct: Number(pct.toFixed(3)),
      hoursSinceLast: Number(hoursSince.toFixed(1)),
    })
    return new Response(null, { status: 202 })
  }

  // Disparar la alerta. Webhook payload compatible con Slack/Discord/ntfy:
  // todos aceptan { text }; Slack además acepta blocks, los obviamos.
  const webhookUrl = Netlify.env.get('COST_ALERT_WEBHOOK_URL')
  const usdSpent = (spentCents / 100).toFixed(2)
  const usdBudget = (budget / 100).toFixed(2)
  const pctDisplay = Math.round(pct * 100)
  const message = `Trama LLM — gasto IA del mes en ${pctDisplay}% del cap. USD ${usdSpent} de ${usdBudget}. Revisa Settings → Estado del sistema, o sube AI_MONTHLY_BUDGET_CENTS.`

  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      })
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        logErrorEvent({
          event: 'cost_alert_webhook_failed',
          status: resp.status,
          message: body.slice(0, 500),
        })
      } else {
        logEvent({ event: 'cost_alert_webhook_sent', pct: pctDisplay })
      }
    } catch (err) {
      logErrorEvent({
        event: 'cost_alert_webhook_error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    logEvent({
      event: 'cost_alert_no_webhook',
      message: 'COST_ALERT_WEBHOOK_URL no configurado — alerta no enviada',
      pct: pctDisplay,
    })
  }

  // Persistir el envío aunque el webhook falle — evita spam si está
  // permanentemente roto. Si el usuario quiere re-disparar manualmente
  // puede DELETE el row.
  await sql`
    INSERT INTO alert_state (code, last_sent_at, payload)
    VALUES (
      ${ALERT_CODE},
      NOW(),
      ${JSON.stringify({ spentCents, budget, pct, message })}::jsonb
    )
    ON CONFLICT (code) DO UPDATE SET
      last_sent_at = NOW(),
      payload = EXCLUDED.payload
  `

  return new Response(null, { status: 202 })
}

export const config: Config = {
  // 12:00 UTC todos los días = 09:00 Chile (UTC-3) en verano,
  // 08:00 Chile en invierno. Hora razonable para que el usuario
  // vea la notificación al empezar el día.
  schedule: '0 12 * * *',
}
