import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import {
  fetchBookmarks,
  getStoredTokens,
  getValidAccessToken,
  getXProfile,
  markSynced,
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
      logEvent({ event: 'x_sync_ok', fetched: items.length, inserted })
      return Response.json({ fetched: items.length, inserted })
    } catch (err) {
      // 403/401 de X = permiso o plan. Mensaje claro en vez de un 502 opaco.
      if (err instanceof XApiError && (err.status === 403 || err.status === 401)) {
        return ApiErrors.unprocessable(
          requestId,
          'X no autorizó la lectura de bookmarks. Si recién agregaste el permiso, ' +
            'desconectá y volvé a conectar X. Si persiste, tu plan de desarrollador de X ' +
            '(Free) podría no incluir la API de Bookmarks.',
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
