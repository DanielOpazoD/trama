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
    artists?: string[] // π3: para track/album, mostrar autoría
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
    // π3: añadimos artists ─ tomamos los artist_names del primer play del
    // álbum como representativos (todos los plays del mismo album_name
    // suelen tener los mismos artistas, salvo compilaciones).
    rows = (await sql`
      SELECT album_name AS key,
             COUNT(*)::int AS plays,
             MIN(played_at) AS first_played,
             MAX(played_at) AS last_played,
             (ARRAY_AGG(album_id))[1] AS sample_spotify_id,
             (ARRAY_AGG(artist_names))[1] AS artists,
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
    // π3: tracks ─ idem, agregamos artists para que el listado no sea
    // ambiguo ("Y2K Cataclysm" puede ser cualquier cosa sin autoría).
    rows = (await sql`
      SELECT track_name AS key,
             COUNT(*)::int AS plays,
             MIN(played_at) AS first_played,
             MAX(played_at) AS last_played,
             (ARRAY_AGG(track_id))[1] AS sample_spotify_id,
             (ARRAY_AGG(artist_names))[1] AS artists,
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

  // π3: summary aggregado del mismo período. Una query única, barata
  // gracias al index BRIN sobre played_at. Devolvemos junto al listado
  // para evitar un round-trip extra del cliente.
  type SummaryRow = {
    total_plays: number
    unique_tracks: number
    unique_artists: number
    unique_albums: number
    total_minutes: number
  }
  const summaryRows = (await sql`
    SELECT
      COUNT(*)::int AS total_plays,
      COUNT(DISTINCT track_id)::int AS unique_tracks,
      COUNT(DISTINCT artist_name)::int AS unique_artists,
      COUNT(DISTINCT album_id)::int AS unique_albums,
      ROUND(COALESCE(SUM(duration_ms), 0) / 60000.0)::int AS total_minutes
    FROM spotify_plays, UNNEST(artist_names) AS artist_name
    WHERE played_at >= ${since}
  `) as unknown as SummaryRow[]
  const summary = summaryRows[0] ?? {
    total_plays: 0,
    unique_tracks: 0,
    unique_artists: 0,
    unique_albums: 0,
    total_minutes: 0,
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
      artists: Array.isArray(r.artists) ? r.artists : undefined,
    })),
    summary: {
      totalPlays: summary.total_plays,
      uniqueTracks: summary.unique_tracks,
      uniqueArtists: summary.unique_artists,
      uniqueAlbums: summary.unique_albums,
      totalMinutes: summary.total_minutes,
    },
  })
})

export const config: Config = {
  path: '/api/spotify/plays',
}
