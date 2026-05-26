import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { disconnectSpotify, getStoredTokens } from './_lib/spotify.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'

/**
 * GET → returns the current Spotify connection state + summary counts.
 * DELETE → disconnects (removes stored tokens).
 */
export default withObservability('spotify-status', async (req, _ctx, { requestId }) => {
  const sql = getSql()

  if (req.method === 'DELETE') {
    await disconnectSpotify(sql)
    return new Response(null, { status: 204 })
  }

  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const stored = await getStoredTokens(sql)
  if (!stored) {
    return Response.json({ connected: false })
  }

  const counts = (await sql`
    SELECT
      COUNT(*) AS total_plays,
      COUNT(DISTINCT track_id) AS unique_tracks,
      MAX(played_at) AS most_recent_play
    FROM spotify_plays
  `) as Array<{ total_plays: string; unique_tracks: string; most_recent_play: string | null }>

  return Response.json({
    connected: true,
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
