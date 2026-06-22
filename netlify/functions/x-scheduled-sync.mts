import type { Config } from '@netlify/functions'
import { getSql, isMissingDatabaseConnectionError, sqlTyped } from './_lib/db.js'
import {
  fetchBookmarks,
  getValidAccessToken,
  getXProfile,
  markSynced,
  runClassify,
  storeBookmarks,
} from './_lib/x/index.js'
import { resolveAIInvocation } from './_lib/ai-mode.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { logEvent, logErrorEvent } from './_lib/observability.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { withObservability } from './_lib/handler-wrap.js'
import { runWithSystemRls } from './_lib/user-rls.js'
import { parseCronTriggerBody } from './_lib/cron-schemas.js'

type XTokenUserRow = {
  user_id: string
  x_user_id: string | null
}

/**
 * Netlify Scheduled Function — sincroniza los bookmarks de X de cada usuario
 * conectado, sin que tenga que apretar "Sincronizar". Espejo del cron de
 * Spotify. Cada 6 horas (los bookmarks no cambian tan rápido como las escuchas).
 *
 * Multi-user: itera CADA usuario con token; una falla de uno (token caído, sin
 * acceso a Bookmarks) no frena a los demás. La clasificación por tema corre
 * best-effort y respeta el cost-cap — si no hay presupuesto, se omite.
 *
 * Netlify ignora el valor de retorno; devolvemos 202 por convención.
 */
export default withObservability(
  'x-scheduled-sync',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    // El body del cron (`{ next_run }`) pasa por Zod: tolerante (body inválido
    // → {}), pero un `next_run` con tipo equivocado ya no se filtra al log.
    const body = await parseCronTriggerBody(req)
    const nextRun = body.next_run ?? 'unknown'

    let sql: ReturnType<typeof getSql>
    try {
      sql = getSql()
    } catch (err) {
      if (isMissingDatabaseConnectionError(err)) {
        logErrorEvent({
          event: 'x_scheduled_sync_skipped',
          reason: 'no_db_url',
          message: 'Netlify Database no está conectada (NETLIFY_DB_URL falta)',
        })
        return ApiSuccess.accepted()
      }
      throw err
    }

    return runWithSystemRls(async () => {
      const userRows = await sqlTyped<XTokenUserRow>(
        sql`
    SELECT user_id, x_user_id FROM x_tokens
  `.catch(() => []),
      )

      if (userRows.length === 0) {
        logEvent({ event: 'x_scheduled_sync_skipped', reason: 'not_connected', nextRun })
        return ApiSuccess.accepted()
      }

      let fetched = 0
      let inserted = 0
      let classified = 0
      let failures = 0
      for (const { user_id: userId, x_user_id } of userRows) {
        try {
          const accessToken = await getValidAccessToken(sql, userId)
          if (!accessToken) {
            failures++
            logErrorEvent({
              event: 'x_scheduled_sync_user_failed',
              userId,
              reason: 'token_refresh_failed',
              message: 'No se pudo obtener un access token válido',
            })
            continue
          }
          let xUserId = x_user_id
          if (!xUserId) {
            const profile = await getXProfile(accessToken)
            xUserId = profile?.id ?? null
          }
          if (!xUserId) {
            failures++
            continue
          }

          const items = await fetchBookmarks(accessToken, xUserId)
          const ins = await storeBookmarks(sql, items, userId)
          await markSynced(sql, userId)
          fetched += items.length
          inserted += ins

          // Auto-clasificar lo nuevo (best-effort, acotado, respeta el cost-cap).
          if (ins > 0) {
            try {
              const overBudget = await checkMonthlyBudget(userId, requestId)
              const invocation = await resolveAIInvocation(req, 'classify', userId)
              if (!overBudget && invocation.kind === 'ready') {
                const r = await runClassify(
                  sql,
                  userId,
                  { provider: invocation.provider, model: invocation.model },
                  2,
                )
                classified += r.classified
              }
            } catch {
              /* clasificación best-effort — el sync ya guardó los bookmarks */
            }
          }
        } catch (err) {
          failures++
          logErrorEvent({
            event: 'x_scheduled_sync_user_failed',
            userId,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      logEvent({
        event: 'x_scheduled_sync_ok',
        users: userRows.length,
        fetched,
        inserted,
        classified,
        failures,
        nextRun,
      })
      return ApiSuccess.accepted()
    })
  },
)

export const config: Config = {
  // Sync MANUAL (no automática) — a pedido del usuario: la sincronización de
  // X la dispara el botón "Sincronizar" en la vista Twitter (endpoint
  // /api/x/sync). Sin `schedule`, esta función ya no corre por cron. Para
  // reactivar el sync periódico, devolver: schedule: '0 */6 * * *'.
}
