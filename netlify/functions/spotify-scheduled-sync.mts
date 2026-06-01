import type { Config } from '@netlify/functions'
import { getSql, isMissingDatabaseConnectionError } from './_lib/db.js'
import {
  fetchRecentlyPlayed,
  getValidAccessToken,
  markSynced,
  storePlays,
} from './_lib/spotify/index.js'
import { logEvent, logErrorEvent } from './_lib/observability.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { withObservability } from './_lib/handler-wrap.js'
import { runWithSystemRls } from './_lib/user-rls.js'

/**
 * Netlify Scheduled Function — Netlify invokes this on its own clock.
 *
 * Runs every 3 hours. That's 8 syncs/day, enough cushion that no plays slip
 * through Spotify's 50-track retention window even if you spend an evening
 * marathoning music.
 *
 * If Spotify isn't connected, this is a no-op. If the token refresh fails,
 * we log it and exit quietly — better than throwing into the void.
 *
 * Return value is ignored by Netlify; we return 202 by convention.
 */
export default withObservability(
  'spotify-scheduled-sync',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    let nextRun = 'unknown'
    try {
      const body = (await req.json().catch(() => ({}))) as { next_run?: string }
      nextRun = body.next_run ?? 'unknown'
    } catch {
      // Ignore — body shape is documented but defensive parsing never hurts.
    }

    let sql: ReturnType<typeof getSql>
    try {
      sql = getSql()
    } catch (err) {
      if (isMissingDatabaseConnectionError(err)) {
        logErrorEvent({
          event: 'spotify_scheduled_sync_skipped',
          reason: 'no_db_url',
          message: 'Netlify Database no está conectada (NETLIFY_DB_URL falta)',
        })
        return ApiSuccess.accepted()
      }
      throw err
    }

    return runWithSystemRls(async () => {
      // Multi-user: sincronizamos a CADA usuario que tenga Spotify conectado, no
      // solo al legacy. Una falla de un usuario (token caído) no frena a los demás.
      const userRows = (await sql`
    SELECT user_id FROM spotify_tokens
  `.catch(() => [])) as Array<{ user_id: string }>

      if (userRows.length === 0) {
        logEvent({
          event: 'spotify_scheduled_sync_skipped',
          reason: 'not_connected',
          nextRun,
        })
        return ApiSuccess.accepted()
      }

      let fetched = 0
      let inserted = 0
      let failures = 0
      for (const { user_id: userId } of userRows) {
        try {
          const accessToken = await getValidAccessToken(sql, userId)
          if (!accessToken) {
            failures++
            logErrorEvent({
              event: 'spotify_scheduled_sync_user_failed',
              userId,
              reason: 'token_refresh_failed',
              message: 'Could not obtain valid access token',
            })
            continue
          }
          const data = await fetchRecentlyPlayed(accessToken)
          const ins = await storePlays(sql, data.items, userId)
          await markSynced(sql, userId)
          fetched += data.items.length
          inserted += ins
        } catch (err) {
          failures++
          logErrorEvent({
            event: 'spotify_scheduled_sync_user_failed',
            userId,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      logEvent({
        event: 'spotify_scheduled_sync_ok',
        users: userRows.length,
        fetched,
        inserted,
        failures,
        nextRun,
      })

      return ApiSuccess.accepted()
    })
  },
)

export const config: Config = {
  // Cron expression in UTC. Every 3 hours: 00:00, 03:00, 06:00, 09:00,
  // 12:00, 15:00, 18:00, 21:00 UTC. Adjust if you want a different cadence —
  // 'schedule' supports any standard cron expression and Netlify shorthand
  // like '@hourly', '@daily', etc.
  schedule: '0 */3 * * *',
}
