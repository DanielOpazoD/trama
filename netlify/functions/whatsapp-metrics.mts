import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { readWhatsAppMetrics } from './_lib/whatsapp/events.js'

/**
 * Métricas del módulo WhatsApp del usuario: capturas por ruta + tasa de fallas +
 * actividad reciente. Lee `whatsapp_events` bajo el RLS del usuario.
 *
 * GET /api/whatsapp-metrics?days=30  (1..90, default 30)
 */
export default withObservability(
  'whatsapp-metrics',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    // getAuthedUser fija el contexto RLS; getSql() lo lee.
    const authedUser = await getAuthedUser(req)
    const sql = getSql()

    const raw = Number(new URL(req.url).searchParams.get('days') ?? 30)
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 30

    const metrics = await readWhatsAppMetrics(sql, authedUser.id, days)
    return Response.json(metrics)
  },
)

export const config: Config = {
  path: '/api/whatsapp-metrics',
}
