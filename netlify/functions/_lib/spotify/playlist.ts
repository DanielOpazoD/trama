/**
 * Importación de playlists: parseo de la referencia (URL/URI/id) y fetch
 * paginado de la metadata + tracks de una playlist.
 */

import { API_BASE } from './client.js'
import {
  SpotifyPlaylistResponse,
  SpotifyPlaylistTracksPage,
  type SpotifyPlaylistResponseT,
} from './schemas.js'

export type SpotifyTrackLite = {
  trackId: string
  trackName: string
  trackUrl: string
  artists: Array<{ id: string; name: string; url: string }>
  album: {
    id: string
    name: string
    url: string
    year: number | null
  }
  durationMs: number
  addedAt: string | null
}

export type PlaylistFetchResult = {
  playlistName: string
  playlistDescription: string
  ownerName: string
  totalTracks: number
  tracks: SpotifyTrackLite[]
}

/**
 * Extract a Spotify playlist id from a URL, URI, or bare id.
 * Accepts:
 *   - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=…
 *   - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 *   - 37i9dQZF1DXcBWIGoYBM5M
 *
 * Returns null if the input doesn't look like a playlist reference.
 */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare base62 id (Spotify ids are 22 chars but be lenient).
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed

  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/)
  if (uriMatch) return uriMatch[1] ?? null

  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.indexOf('playlist')
    const id = parts[idx + 1]
    if (idx !== -1 && id) return id
  } catch {
    // not a URL — fall through
  }
  return null
}

/**
 * Fetch a playlist's metadata + every track, following Spotify's pagination.
 * Stops at MAX_TRACKS to keep responses bounded.
 */
export async function fetchPlaylist(
  accessToken: string,
  playlistId: string,
  maxTracks = 500,
): Promise<PlaylistFetchResult> {
  const headers = { Authorization: `Bearer ${accessToken}` }

  // Shapes validados en runtime — ver `SpotifyPlaylist*` en schemas.ts.
  type PlaylistTrackItem = SpotifyPlaylistResponseT['tracks']['items'][number]

  const initial = await fetch(`${API_BASE}/playlists/${playlistId}`, { headers })
  if (!initial.ok) {
    const text = await initial.text()
    throw new Error(`Spotify playlist fetch failed (${initial.status}): ${text}`)
  }
  const playlist = SpotifyPlaylistResponse.parse(await initial.json())

  const countPlayableTracks = (items: PlaylistTrackItem[]): number =>
    items.filter((it) => it.track?.id).length

  const items: PlaylistTrackItem[] = [...playlist.tracks.items]
  let next = playlist.tracks.next
  while (next && countPlayableTracks(items) < maxTracks) {
    const r = await fetch(next, { headers })
    if (!r.ok) break
    const page = SpotifyPlaylistTracksPage.parse(await r.json())
    items.push(...page.items)
    next = page.next
  }

  const tracks: SpotifyTrackLite[] = items
    .map((it) => (it.track && it.track.id ? { it, track: it.track } : null))
    .filter(
      (
        x,
      ): x is { it: PlaylistTrackItem; track: NonNullable<PlaylistTrackItem['track']> } =>
        x !== null,
    )
    .slice(0, maxTracks)
    .map(({ it, track }) => ({
      trackId: track.id ?? '',
      trackName: track.name,
      trackUrl:
        track.external_urls.spotify ?? `https://open.spotify.com/track/${track.id}`,
      artists: track.artists.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.external_urls.spotify ?? `https://open.spotify.com/artist/${a.id}`,
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        url:
          track.album.external_urls.spotify ??
          `https://open.spotify.com/album/${track.album.id}`,
        year: track.album.release_date
          ? Number.parseInt(track.album.release_date.slice(0, 4), 10) || null
          : null,
      },
      durationMs: track.duration_ms,
      addedAt: it.added_at,
    }))

  return {
    playlistName: playlist.name,
    playlistDescription: playlist.description ?? '',
    ownerName: playlist.owner.display_name ?? playlist.owner.id,
    totalTracks: playlist.tracks.total,
    tracks,
  }
}
