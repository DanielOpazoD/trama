import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import {
  fetchRecentlyPlayed,
  markSynced,
  requireSpotifyConnection,
  storePlays,
} from './_lib/spotify.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Fetches recent plays from Spotify and stores them. Idempotent: re-running
 * doesn't create duplicates.
 *
 * Multi-user: token, plays y markSynced filtran/persisten por userId.
 *
 * Spotify only retains the 50 most-recent plays; el cron de
 * spotify-scheduled-sync corre cada 3h para no perder plays.
 */
export default withObservability('spotify-sync', async (req, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()

  const conn = await requireSpotifyConnection({ sql, userId, requestId })
  if (!conn.ok) return conn.response

  const data = await fetchRecentlyPlayed(conn.token)
  const inserted = await storePlays(sql, data.items, userId)
  await markSynced(sql, userId)

  return Response.json({
    fetched: data.items.length,
    inserted,
    mostRecentPlay: data.items[0]?.played_at ?? null,
  })
})

export const config: Config = {
  path: '/api/spotify/sync',
}
