/**
 * Spotify sync: lectura del historial reciente (/me/player/recently-played)
 * y persistencia en spotify_plays, más marcadores de estado (last_synced_at)
 * y desconexión.
 */

import { API_BASE, type SqlClient } from './client.js'

type RecentlyPlayedResponse = {
  items: Array<{
    played_at: string
    track: {
      id: string
      name: string
      duration_ms: number
      artists: Array<{ id: string; name: string }>
      album: { id: string; name: string }
    }
  }>
}

/**
 * Fetch the 50 most-recently played tracks. Spotify only retains the last 50,
 * so a regular sync cadence (say, every hour) is what keeps the log complete.
 */
export async function fetchRecentlyPlayed(
  accessToken: string,
  afterMs?: number,
): Promise<RecentlyPlayedResponse> {
  const url = new URL(`${API_BASE}/me/player/recently-played`)
  url.searchParams.set('limit', '50')
  if (afterMs) url.searchParams.set('after', String(afterMs))

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Spotify recently-played failed (${r.status}): ${text}`)
  }
  return (await r.json()) as RecentlyPlayedResponse
}

/**
 * Store new plays in spotify_plays. Returns the number of new rows inserted.
 * Uses ON CONFLICT to dedupe by (track_id, played_at) so re-syncing is safe.
 */
export async function storePlays(
  sql: SqlClient,
  items: RecentlyPlayedResponse['items'],
  userId: string,
): Promise<number> {
  let inserted = 0
  for (const item of items) {
    const artistIds = item.track.artists.map((a) => a.id)
    const artistNames = item.track.artists.map((a) => a.name)
    const result = (await sql`
      INSERT INTO spotify_plays (
        track_id, track_name, artist_ids, artist_names,
        album_id, album_name, duration_ms, played_at, user_id
      ) VALUES (
        ${item.track.id},
        ${item.track.name},
        ${artistIds},
        ${artistNames},
        ${item.track.album.id},
        ${item.track.album.name},
        ${item.track.duration_ms},
        ${item.played_at},
        ${userId}
      )
      ON CONFLICT (track_id, played_at) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>
    if (result.length > 0) inserted++
  }
  return inserted
}

export async function markSynced(sql: SqlClient, userId: string): Promise<void> {
  await sql`UPDATE spotify_tokens SET last_synced_at = NOW() WHERE user_id = ${userId}`
}

export async function disconnectSpotify(sql: SqlClient, userId: string): Promise<void> {
  await sql`DELETE FROM spotify_tokens WHERE user_id = ${userId}`
}
