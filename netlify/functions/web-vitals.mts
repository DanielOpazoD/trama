import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'

/**
 * N6: POST /api/web-vitals — recibe Core Web Vitals del cliente.
 *
 * El web-vitals lib en `src/lib/webVitals.ts` envía cada métrica
 * (LCP, INP, CLS, FCP, TTFB) cuando está lista. Las persistimos vía
 * logEvent — quedan en los logs de Netlify Functions y eventualmente
 * podríamos agregarlas a una tabla `web_vitals_samples` si queremos
 * dashboarear.
 *
 * Lightweight a propósito:
 * - No validamos con Zod estricto: si el browser manda algo raro,
 *   logueamos lo que vino sin tirar 400 (web-vitals no espera response).
 * - No requerimos auth: estas métricas no son sensibles. Para
 *   correlacionar con un user específico habría que pasar el user_id
 *   en el header (futuro).
 * - 204 siempre: el `sendBeacon` del cliente no lee el body.
 *
 * SLOs informales (target):
 * - LCP < 2.5s p75
 * - INP < 200ms p75
 * - CLS < 0.1 p75
 * Si pasamos los thresholds, abrimos un issue para investigar.
 */
type WebVitalsBody = {
  name?: string
  value?: number
  rating?: string
  delta?: number
  id?: string
  navigationType?: string
  path?: string
}

export default withObservability('web-vitals', async (req, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const body = (await req.json().catch(() => ({}))) as WebVitalsBody

  logEvent({
    event: 'web_vitals',
    metric: body.name,
    value: body.value,
    rating: body.rating,
    delta: body.delta,
    path: body.path,
    navigationType: body.navigationType,
  })

  return new Response(null, { status: 204 })
})

export const config: Config = {
  path: '/api/web-vitals',
}
