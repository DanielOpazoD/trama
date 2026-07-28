import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import {
  disconnectSpotify,
  getStoredTokens,
  needsReconnect,
} from './_lib/spotify/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

type CountsRow = {
  total_plays: string
  unique_tracks: string
  most_recent_play: string | null
}

/**
 * GET → returns the current Spotify connection state + summary counts.
 * DELETE → disconnects (removes stored tokens).
 *
 * Multi-user: tanto el token como los plays se filtran por userId.
 */
export default withObservability('spotify-status', async (req, _ctx, { requestId }) => {
  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()

  if (req.method === 'DELETE') {
    await disconnectSpotify(sql, userId)
    return ApiSuccess.noContent()
  }

  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const stored = await getStoredTokens(sql, userId)
  if (!stored) {
    return Response.json({ connected: false })
  }

  const counts = await sqlTyped<CountsRow>(sql`
    SELECT
      COUNT(*) AS total_plays,
      COUNT(DISTINCT track_id) AS unique_tracks,
      MAX(played_at) AS most_recent_play
    FROM spotify_plays
    WHERE user_id = ${userId}
  `)

  return Response.json({
    connected: true,
    // Hay tokens guardados, pero pueden no servir: ver `needsReconnect`.
    needsReconnect: needsReconnect(stored),
    spotifyUserId: stored.spotify_user_id,
    displayName: stored.display_name,
    connectedAt: stored.connected_at,
    lastSyncedAt: stored.last_synced_at,
    counts: {
      totalPlays: Number(counts[0]?.total_plays ?? 0),
      uniqueTracks: Number(counts[0]?.unique_tracks ?? 0),
      mostRecentPlay: counts[0]?.most_recent_play ?? null,
    },
  })
})

export const config: Config = {
  path: '/api/spotify/status',
}
