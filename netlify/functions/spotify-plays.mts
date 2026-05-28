import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

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
export default withObservability('spotify-plays', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const { id: userId } = await getAuthedUser(req)
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
    rows = await sqlTyped<Group>(sql`
      WITH plays AS (
        SELECT UNNEST(artist_names) AS artist_name, UNNEST(artist_ids) AS artist_id, played_at
        FROM spotify_plays
        WHERE played_at >= ${since} AND user_id = ${userId}
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
        ON LOWER(e.name) = LOWER(g.key) AND e.deleted_at IS NULL AND e.user_id = ${userId}
      ORDER BY g.plays DESC
      LIMIT ${limit}
    `)
  } else if (group === 'album') {
    // π3-fix: para llevar artist_names al cliente, usamos DISTINCT ON
    // sobre el play más reciente. ARRAY_AGG(text[]) era frágil — si dos
    // plays del mismo álbum tenían arrays de distinto largo (1 artista
    // vs un feat con 2), PG podía tirar "cannot accumulate arrays of
    // different sizes" o devolver text[][] mal serializado por el
    // driver. DISTINCT ON garantiza UNA fila → UN array.
    rows = await sqlTyped<Group>(sql`
      WITH per_album AS (
        SELECT DISTINCT ON (album_name)
          album_name, artist_names, album_id, played_at
        FROM spotify_plays
        WHERE played_at >= ${since} AND album_name IS NOT NULL AND user_id = ${userId}
        ORDER BY album_name, played_at DESC
      ),
      counts AS (
        SELECT album_name,
               COUNT(*)::int AS plays,
               MIN(played_at) AS first_played,
               MAX(played_at) AS last_played
        FROM spotify_plays
        WHERE played_at >= ${since} AND album_name IS NOT NULL AND user_id = ${userId}
        GROUP BY album_name
      )
      SELECT c.album_name AS key,
             c.plays,
             c.first_played,
             c.last_played,
             p.album_id AS sample_spotify_id,
             p.artist_names AS artists,
             e.id AS existing_entity_id
      FROM counts c
      JOIN per_album p ON p.album_name = c.album_name
      LEFT JOIN entities e
        ON LOWER(e.name) = LOWER(c.album_name) AND e.deleted_at IS NULL AND e.user_id = ${userId}
      ORDER BY c.plays DESC
      LIMIT ${limit}
    `)
  } else {
    // π3-fix: idem tracks. DISTINCT ON sobre played_at DESC nos da la
    // versión más reciente del track con SU artist_names intacto.
    rows = await sqlTyped<Group>(sql`
      WITH per_track AS (
        SELECT DISTINCT ON (track_name)
          track_name, artist_names, track_id, played_at
        FROM spotify_plays
        WHERE played_at >= ${since} AND user_id = ${userId}
        ORDER BY track_name, played_at DESC
      ),
      counts AS (
        SELECT track_name,
               COUNT(*)::int AS plays,
               MIN(played_at) AS first_played,
               MAX(played_at) AS last_played
        FROM spotify_plays
        WHERE played_at >= ${since} AND user_id = ${userId}
        GROUP BY track_name
      )
      SELECT c.track_name AS key,
             c.plays,
             c.first_played,
             c.last_played,
             p.track_id AS sample_spotify_id,
             p.artist_names AS artists,
             e.id AS existing_entity_id
      FROM counts c
      JOIN per_track p ON p.track_name = c.track_name
      LEFT JOIN entities e
        ON LOWER(e.name) = LOWER(c.track_name) AND e.deleted_at IS NULL AND e.user_id = ${userId}
      ORDER BY c.plays DESC
      LIMIT ${limit}
    `)
  }

  // π3 + ρ-fix-bug: summary aggregado del mismo período.
  //
  // ANTES: una sola query con `FROM spotify_plays, UNNEST(artist_names)`
  // hacía un cross-join entre cada play y sus artistas — así
  // total_plays se multiplicaba por la cantidad promedio de artistas
  // por canción (un feat con 2 artistas duplicaba el conteo). Tampoco
  // se notaba si el usuario solo escuchaba solistas, pero con feats el
  // total inflaba.
  //
  // AHORA: dos queries separadas y baratas — una sobre la tabla cruda
  // (totales verdaderos) y otra sólo para `unique_artists` que SÍ
  // necesita el UNNEST porque artist_names es un array. Ambas filtran
  // por el mismo `since` y aprovechan el index BRIN.
  type CoreRow = {
    total_plays: number
    unique_tracks: number
    unique_albums: number
    total_minutes: number
  }
  const coreRows = await sqlTyped<CoreRow>(sql`
    SELECT
      COUNT(*)::int AS total_plays,
      COUNT(DISTINCT track_id)::int AS unique_tracks,
      COUNT(DISTINCT album_id)::int AS unique_albums,
      ROUND(COALESCE(SUM(duration_ms), 0) / 60000.0)::int AS total_minutes
    FROM spotify_plays
    WHERE played_at >= ${since} AND user_id = ${userId}
  `)
  const core = coreRows[0] ?? {
    total_plays: 0,
    unique_tracks: 0,
    unique_albums: 0,
    total_minutes: 0,
  }

  type ArtistRow = { unique_artists: number }
  const artistRows = await sqlTyped<ArtistRow>(sql`
    SELECT COUNT(DISTINCT artist_name)::int AS unique_artists
    FROM spotify_plays, UNNEST(artist_names) AS artist_name
    WHERE played_at >= ${since} AND user_id = ${userId}
  `)
  const uniqueArtists = artistRows[0]?.unique_artists ?? 0

  const summary = {
    total_plays: core.total_plays,
    unique_tracks: core.unique_tracks,
    unique_artists: uniqueArtists,
    unique_albums: core.unique_albums,
    total_minutes: core.total_minutes,
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
