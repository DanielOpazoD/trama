import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { MissingDatabaseConnectionError } from '@netlify/database'
import {
  fetchRecentlyPlayed,
  getStoredTokens,
  getValidAccessToken,
  markSynced,
  storePlays,
} from './_lib/spotify.js'
import { logEvent, logErrorEvent } from './_lib/observability.js'

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
export default async (req: Request) => {
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
    if (err instanceof MissingDatabaseConnectionError) {
      logErrorEvent({
        event: 'spotify_scheduled_sync_skipped',
        reason: 'no_db_url',
        message: 'Netlify Database no está conectada (NETLIFY_DB_URL falta)',
      })
      return new Response(null, { status: 202 })
    }
    throw err
  }

  // If the user hasn't connected Spotify, this function has nothing to do.
  const tokens = await getStoredTokens(sql).catch(() => null)
  if (!tokens) {
    logEvent({
      event: 'spotify_scheduled_sync_skipped',
      reason: 'not_connected',
      nextRun,
    })
    return new Response(null, { status: 202 })
  }

  try {
    const accessToken = await getValidAccessToken(sql)
    if (!accessToken) {
      logErrorEvent({
        event: 'spotify_scheduled_sync_failed',
        reason: 'token_refresh_failed',
        message: 'Could not obtain valid access token',
      })
      return new Response(null, { status: 202 })
    }

    const data = await fetchRecentlyPlayed(accessToken)
    const inserted = await storePlays(sql, data.items)
    await markSynced(sql)

    logEvent({
      event: 'spotify_scheduled_sync_ok',
      fetched: data.items.length,
      inserted,
      mostRecentPlay: data.items[0]?.played_at ?? null,
      nextRun,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logErrorEvent({
      event: 'spotify_scheduled_sync_failed',
      message,
      nextRun,
    })
  }

  return new Response(null, { status: 202 })
}

export const config: Config = {
  // Cron expression in UTC. Every 3 hours: 00:00, 03:00, 06:00, 09:00,
  // 12:00, 15:00, 18:00, 21:00 UTC. Adjust if you want a different cadence —
  // 'schedule' supports any standard cron expression and Netlify shorthand
  // like '@hourly', '@daily', etc.
  schedule: '0 */3 * * *',
}
