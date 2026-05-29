import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import {
  fetchPlaylist,
  parsePlaylistId,
  requireSpotifyConnection,
} from './_lib/spotify/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { SpotifyImportPlaylistBody } from './_lib/admin-schemas.js'
import { logEvent } from './_lib/observability.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Given a Spotify playlist URL/URI/id, returns a structured proposal the user
 * can review before applying:
 *   - one 'banda/musico' entity per unique artist
 *   - one 'cancion' entity per track
 *   - 'asociado_con' relationships from each track back to its primary artist
 *
 * Nothing gets written to the trama here; the UI uses the same accept flow as
 * the chat / suggest endpoints. The `spotifyUrl` field on each entity carries
 * the open.spotify.com link, ready for "open in Spotify" buttons.
 */
export default withObservability('spotify-import-playlist', async (req, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const { id: userId } = await getAuthedUser(req)

  const parsed = await parseJsonBody(req, SpotifyImportPlaylistBody, requestId)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const input = (body.playlistId ?? body.url ?? '').trim()

  const playlistId = parsePlaylistId(input)
  if (!playlistId) {
    return ApiErrors.validation(
      requestId,
      'No reconozco eso como una playlist de Spotify. Pega el enlace https://open.spotify.com/playlist/… o el id.',
    )
  }

  const sql = getSql()
  const conn = await requireSpotifyConnection({
    sql,
    userId,
    requestId,
    message:
      'Spotify no está conectado. Conecta primero desde Configuración → Spotify.',
  })
  if (!conn.ok) return conn.response

  let playlist
  try {
    playlist = await fetchPlaylist(
      conn.token,
      playlistId,
      Math.min(body.maxTracks ?? 200, 500),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return ApiErrors.upstream(requestId, `No pude leer la playlist: ${message}`)
  }

  // Dedup artists by id.
  const artistMap = new Map<
    string,
    { name: string; url: string }
  >()
  for (const track of playlist.tracks) {
    for (const a of track.artists) {
      if (!artistMap.has(a.id)) artistMap.set(a.id, { name: a.name, url: a.url })
    }
  }

  type ProposedEntity = {
    type: string
    name: string
    year?: number
    description?: string
    spotifyUrl?: string
  }
  type ProposedRelationship = {
    fromName: string
    toName: string
    type: string
    notes?: string
  }

  const artistEntities: ProposedEntity[] = [...artistMap.entries()].map(
    ([_, a]) => ({
      type: 'musico',
      name: a.name,
      spotifyUrl: a.url,
    }),
  )

  const trackEntities: ProposedEntity[] = playlist.tracks.map((t) => ({
    type: 'cancion',
    name: t.trackName,
    year: t.album.year ?? undefined,
    description:
      t.artists.length > 0
        ? `de ${t.artists.map((a) => a.name).join(', ')} · álbum: ${t.album.name}`
        : undefined,
    spotifyUrl: t.trackUrl,
  }))

  // Each track → primary artist (the first listed) becomes an
  // 'asociado_con' edge. We avoid creating an edge per artist on a track to
  // keep the proposal compact; users can add more from the chat later.
  const relationships: ProposedRelationship[] = playlist.tracks.flatMap((t) => {
    const primary = t.artists[0]
    if (!primary) return []
    return [
      {
        fromName: primary.name,
        toName: t.trackName,
        type: 'asociado_con',
        notes: 'desde playlist de Spotify',
      },
    ]
  })

  logEvent({
    event: 'spotify_import_playlist_ok',
    playlistId,
    playlistName: playlist.playlistName,
    totalTracks: playlist.totalTracks,
    proposedArtists: artistEntities.length,
    proposedTracks: trackEntities.length,
    proposedRelationships: relationships.length,
  })

  return Response.json({
    playlist: {
      id: playlistId,
      name: playlist.playlistName,
      description: playlist.playlistDescription,
      ownerName: playlist.ownerName,
      totalTracks: playlist.totalTracks,
    },
    proposal: {
      entities: [...artistEntities, ...trackEntities],
      relationships,
      quotes: [],
    },
  })
})

export const config: Config = {
  path: '/api/spotify/import-playlist',
}
