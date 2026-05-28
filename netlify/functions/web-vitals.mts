import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { getAuthedUser, UnauthenticatedError } from './_lib/auth.js'

/**
 * N6 + R2: POST /api/web-vitals — recibe Core Web Vitals del cliente.
 *
 * El cliente envía vía `sendBeacon` (no espera response) una métrica
 * por POST. Persistimos en `web_vitals_samples` (append-only) + logueamos
 * a stdout para Netlify Functions logs.
 *
 * Lightweight a propósito:
 * - No requerimos auth: estas métricas no son sensibles. Si hay
 *   Bearer token válido, asociamos el sample al user; sino queda
 *   con user_id 'legacy-single-user' (consistente con error-log POST).
 * - El path viene **normalizado** del cliente (UUIDs ofuscados a `:id`
 *   antes de enviar — ver `src/lib/webVitals.ts` y R3 del Tier
 *   cleanup). Acá lo recibimos literal; no hacemos sanitización extra.
 * - 204 siempre: el `sendBeacon` no lee body.
 * - DB write es best-effort — si falla, el log a stdout sigue.
 *
 * SLOs informales (`docs/observability.md`):
 *   LCP < 2.5s p75 · INP < 200ms p75 · CLS < 0.1 p75
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

  // user_id opcional: si el cliente tiene Bearer válido (Clerk activo)
  // lo asociamos; sino cae a legacy. UnauthenticatedError no debe
  // bloquear el sample — Web Vitals son anónimas-friendly.
  let userId = 'legacy-single-user'
  try {
    const authed = await getAuthedUser(req)
    userId = authed.id
  } catch (err) {
    if (!(err instanceof UnauthenticatedError)) throw err
  }

  // Persist a stdout siempre (cheap + barato de migrar si rotamos DB).
  logEvent({
    event: 'web_vitals',
    metric: body.name,
    value: body.value,
    rating: body.rating,
    delta: body.delta,
    path: body.path,
    navigationType: body.navigationType,
  })

  // R2: persistir en `web_vitals_samples` (append-only). Best-effort:
  // si la DB no está disponible o la tabla aún no existe (deploy
  // preview en una rama sin la migration), no rompemos al cliente.
  try {
    const sql = getSql()
    await sql`
      INSERT INTO web_vitals_samples
        (metric, value, rating, delta, path, navigation_type, user_id)
      VALUES (
        ${body.name ?? null},
        ${body.value ?? null},
        ${body.rating ?? null},
        ${body.delta ?? null},
        ${body.path ?? null},
        ${body.navigationType ?? null},
        ${userId}
      )
    `
  } catch {
    // Sin DB / sin tabla todavía → solo nos quedamos con el log stdout.
  }

  return new Response(null, { status: 204 })
})

export const config: Config = {
  path: '/api/web-vitals',
}
