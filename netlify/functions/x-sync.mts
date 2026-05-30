import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { resolveAIInvocation } from './_lib/ai-mode.js'
import {
  fetchBookmarks,
  getStoredTokens,
  getValidAccessToken,
  getXProfile,
  markSynced,
  runClassify,
  storeBookmarks,
  XApiError,
} from './_lib/x/index.js'

/**
 * POST /api/x/sync — trae los bookmarks del usuario desde X y los guarda
 * (dedup por tweet). Devuelve { fetched, inserted }.
 */
export default withObservability(
  'x-sync',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    const tokens = await getStoredTokens(sql, userId)
    if (!tokens) return ApiErrors.validation(requestId, 'X no está conectado')

    const accessToken = await getValidAccessToken(sql, userId)
    if (!accessToken) return ApiErrors.validation(requestId, 'X no está conectado')

    // Necesitamos el id de usuario de X para el endpoint de bookmarks; si no
    // quedó guardado al conectar, lo resolvemos vía /me.
    let xUserId = tokens.x_user_id
    if (!xUserId) {
      const profile = await getXProfile(accessToken)
      xUserId = profile?.id ?? null
    }
    if (!xUserId) {
      return ApiErrors.upstream(requestId, 'No se pudo resolver el usuario de X')
    }

    try {
      const items = await fetchBookmarks(accessToken, xUserId)
      const inserted = await storeBookmarks(sql, items, userId)
      await markSynced(sql, userId)

      // Auto-clasificar lo nuevo por tema (best-effort: si la IA está off, sin
      // presupuesto, o falla, NO rompe el sync — el botón on-demand lo retoma).
      let classified = 0
      if (inserted > 0) {
        try {
          const overBudget = await checkMonthlyBudget(userId, requestId)
          const invocation = await resolveAIInvocation(req, 'classify', userId)
          if (!overBudget && invocation.kind === 'ready') {
            const r = await runClassify(
              sql,
              userId,
              { provider: invocation.provider, model: invocation.model },
              3,
            )
            classified = r.classified
          }
        } catch {
          /* clasificación best-effort — el sync ya guardó los bookmarks */
        }
      }

      logEvent({ event: 'x_sync_ok', fetched: items.length, inserted, classified })
      return Response.json({ fetched: items.length, inserted, classified })
    } catch (err) {
      // 403/401 de X = permiso o plan. Mensaje claro en vez de un 502 opaco,
      // incluyendo la razón exacta que devuelve X (title/reason) para
      // distinguir "falta el scope" (reconectar) de "el plan no incluye la API".
      if (err instanceof XApiError && (err.status === 403 || err.status === 401)) {
        let reason = ''
        try {
          const j = JSON.parse(err.body) as {
            title?: string
            reason?: string
            detail?: string
          }
          reason = [j.title, j.reason].filter(Boolean).join(' · ')
        } catch {
          reason = err.body.slice(0, 120)
        }
        const suffix = reason ? ` (X: ${reason})` : ''
        logEvent({ event: 'x_sync_forbidden', status: err.status, reason })
        return ApiErrors.unprocessable(
          requestId,
          `X no autorizó la lectura de bookmarks${suffix}. Si recién agregaste el ` +
            'permiso, desconectá y volvé a conectar X. Si persiste, tu plan de ' +
            'desarrollador de X (Free) podría no incluir la API de Bookmarks.',
        )
      }
      const message = err instanceof Error ? err.message : String(err)
      return ApiErrors.upstream(requestId, `Error sincronizando X: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/x/sync',
}
