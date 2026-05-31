import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { getAuthedUser, UnauthenticatedError } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'

/**
 * N6 + R2: POST /api/web-vitals — recibe Core Web Vitals del cliente.
 *
 * El cliente envía vía `sendBeacon` (no espera response) una métrica
 * por POST. Persistimos en `web_vitals_samples` (append-only) + logueamos
 * a stdout para Netlify Functions logs.
 *
 * Lightweight a propósito:
 * - No requerimos auth para responder 204: estas métricas no son sensibles.
 *   Si hay Bearer token válido, asociamos el sample al user. En modo
 *   single-user sin Clerk, getAuthedUser() devuelve legacy-single-user. En
 *   multi-user estricto, si falta token, logueamos stdout pero no persistimos
 *   bajo el usuario legacy.
 * - El path viene **normalizado** del cliente (UUIDs ofuscados a `:id`
 *   antes de enviar — ver `src/lib/webVitals.ts` y R3 del Tier
 *   cleanup). Acá lo recibimos literal; no hacemos sanitización extra.
 * - 204 para muestras válidas: el `sendBeacon` no lee body. Payloads inválidos
 *   reciben error canónico y no se persisten como filas vacías.
 * - DB write es best-effort — si falla, el log a stdout sigue.
 *
 * SLOs informales (`docs/observability.md`):
 *   LCP < 2.5s p75 · INP < 200ms p75 · CLS < 0.1 p75
 */
const WebVitalsBody = z.object({
  name: z.string().min(1).max(20),
  value: z.number().finite(),
  rating: z.string().max(40).optional(),
  delta: z.number().finite().optional(),
  id: z.string().max(200).optional(),
  navigationType: z.string().max(80).optional(),
  path: z.string().max(500).optional(),
})

export default withObservability('web-vitals', async (req, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const parsed = await parseJsonBody(req, WebVitalsBody, requestId)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // user_id opcional: si el cliente tiene Bearer válido (Clerk activo)
  // lo asociamos. UnauthenticatedError no debe bloquear el sample — Web
  // Vitals son anónimas-friendly, pero no se persisten como legacy en modo
  // multi-user estricto.
  let userId: string | null = null
  let authedUser: Awaited<ReturnType<typeof getAuthedUser>> | null = null
  try {
    const authed = await getAuthedUser(req)
    authedUser = authed
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
    if (authedUser && userId) {
      await ensureUserRow(sql, authedUser)
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
    }
  } catch {
    // Sin DB / sin tabla todavía → solo nos quedamos con el log stdout.
  }

  return ApiSuccess.noContent()
})

export const config: Config = {
  path: '/api/web-vitals',
}
