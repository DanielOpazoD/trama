import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * Returns aggregated views of Spotify plays — what you've actually been
 * listening to, grouped so it's reviewable instead of a flat stream.
 *
 * Query params:
 *   group=artist | album | track  (default 'artist')
 *   since=ISO date                (default: 90 days ago)
 *   limit=N                       (default 50)
 *
 * For each group it returns:
 *   - the key (artist/album/track name)
 *   - play count
 *   - first and last played timestamps
 *   - whether an entity with the same name already exists in the trama
 */
export default withObservability('spotify-plays', async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const sql = getSql()

  const url = new URL(req.url)
  const group = (url.searchParams.get('group') ?? 'artist').toLowerCase()
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
  const sinceParam = url.searchParams.get('since')
  const since = sinceParam ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  type Group = {
    key: string
    plays: number
    first_played: string
    last_played: string
    existing_entity_id: string | null
    sample_spotify_id?: string
  }

  let rows: Group[] = []

  if (group === 'artist') {
    rows = (await sql`
      WITH plays AS (
        SELECT UNNEST(artist_names) AS artist_name, UNNEST(artist_ids) AS artist_id, played_at
        FROM spotify_plays
        WHERE played_at >= ${since}
      ),
      grouped AS (
        SELECT artist_name AS key,
               COUNT(*)::int AS plays,
               MIN(played_at) AS first_played,
               MAX(played_at) AS last_played,
               (ARRAY_AGG(artist_id))[1] AS sample_spotify_id
        FROM plays
        GROUP BY artist_name
      )
      SELECT g.key, g.plays, g.first_played, g.last_played, g.sample_spotify_id,
             e.id AS existing_entity_id
      FROM grouped g
      LEFT JOIN entities e
        ON LOWER(e.name) = LOWER(g.key) AND e.deleted_at IS NULL
      ORDER BY g.plays DESC
      LIMIT ${limit}
    `) as unknown as Group[]
  } else if (group === 'album') {
    rows = (await sql`
      SELECT album_name AS key,
             COUNT(*)::int AS plays,
             MIN(played_at) AS first_played,
             MAX(played_at) AS last_played,
             (ARRAY_AGG(album_id))[1] AS sample_spotify_id,
             e.id AS existing_entity_id
      FROM spotify_plays p
      LEFT JOIN entities e
        ON LOWER(e.name) = LOWER(p.album_name) AND e.deleted_at IS NULL
      WHERE p.played_at >= ${since} AND album_name IS NOT NULL
      GROUP BY album_name, e.id
      ORDER BY plays DESC
      LIMIT ${limit}
    `) as unknown as Group[]
  } else {
    rows = (await sql`
      SELECT track_name AS key,
             COUNT(*)::int AS plays,
             MIN(played_at) AS first_played,
             MAX(played_at) AS last_played,
             (ARRAY_AGG(track_id))[1] AS sample_spotify_id,
             e.id AS existing_entity_id
      FROM spotify_plays p
      LEFT JOIN entities e
        ON LOWER(e.name) = LOWER(p.track_name) AND e.deleted_at IS NULL
      WHERE p.played_at >= ${since}
      GROUP BY track_name, e.id
      ORDER BY plays DESC
      LIMIT ${limit}
    `) as unknown as Group[]
  }

  return Response.json({
    group,
    since,
    items: rows.map((r) => ({
      key: r.key,
      plays: r.plays,
      firstPlayed: r.first_played,
      lastPlayed: r.last_played,
      existingEntityId: r.existing_entity_id ?? null,
      spotifyId: r.sample_spotify_id ?? null,
    })),
  })
})

export const config: Config = {
  path: '/api/spotify/plays',
}
