/**
 * Spotify: status + sync + plays + library snapshot + sugerencias IA.
 *
 * El OAuth flow lo maneja el browser via window.location; estos métodos son
 * solo para la app web hablándole al backend que ya tiene tokens.
 */

import type { ExtractionProposal } from '../types'
import { request } from './request'

export type SpotifyLibrarySnapshot = {
  savedCount: number
  topGenres: Array<{ name: string; weight: number }>
  topArtists: Array<{ name: string; popularity: number; genres: string[] }>
  topTracks: Array<{ name: string; artists: string[]; year: number | null }>
  decades: Array<{ decade: string; count: number }>
  aiSummary: string | null
  provider: string | null
  model: string | null
  aiError?: string
}

export type SpotifyStatus =
  | { connected: false }
  | {
      connected: true
      spotifyUserId: string | null
      displayName: string | null
      connectedAt: string
      lastSyncedAt: string | null
      counts: {
        totalPlays: number
        uniqueTracks: number
        mostRecentPlay: string | null
      }
    }

export type SpotifyPlayGroup = {
  key: string
  plays: number
  firstPlayed: string
  lastPlayed: string
  existingEntityId: string | null
  spotifyId: string | null
  /** π3: presente para group='track' y 'album'. Para 'artist' es undefined
      (el key YA es el artista). */
  artists?: string[]
}

/** π3: agregado del período. Mismo `since` que la lista. */
export type SpotifyPlaysSummary = {
  totalPlays: number
  uniqueTracks: number
  uniqueArtists: number
  uniqueAlbums: number
  /** Minutos totales escuchados (redondeados). */
  totalMinutes: number
}

export type SpotifyPlaysResponse = {
  group: 'artist' | 'album' | 'track'
  since: string
  items: SpotifyPlayGroup[]
  summary: SpotifyPlaysSummary
}

/** π4: timestamps crudos para agregación client-side en TZ local. */
export type SpotifyTimingResponse = {
  since: string
  playedAts: string[]
  /** true si la lista se cortó por el cap de seguridad del server. */
  truncated: boolean
}

/** π5: sugerencias de artistas para descubrir, devueltas por el LLM. */
export type SpotifyArtistSuggestion = {
  name: string
  type: 'musico' | 'banda'
  description: string
  reason: string
}

export type SpotifyArtistSuggestionsResponse = {
  suggestions: SpotifyArtistSuggestion[]
  provider: string | null
  model: string | null
  reason?: string
}

export type SpotifyPlaylistImport = {
  playlist: {
    id: string
    name: string
    description: string
    ownerName: string
    totalTracks: number
  }
  proposal: {
    entities: Array<{
      type: string
      name: string
      year?: number
      description?: string
      spotifyUrl?: string
    }>
    relationships: Array<{
      fromName: string
      toName: string
      type: string
      notes?: string
    }>
    quotes: Array<{
      entityName: string
      text: string
      source?: string
    }>
  }
}

export const spotifyApi = {
  async spotifyStatus(): Promise<SpotifyStatus> {
    return request<SpotifyStatus>('/api/spotify/status')
  },
  async spotifySync(): Promise<{ fetched: number; inserted: number; mostRecentPlay: string | null }> {
    return request('/api/spotify/sync', { method: 'POST' })
  },
  async spotifyDisconnect(): Promise<void> {
    await request<void>('/api/spotify/status', { method: 'DELETE' })
  },
  async spotifyPlays(
    group: 'artist' | 'album' | 'track' = 'artist',
    limit = 50,
    /** π3: ventana temporal (ISO string). Si se omite, el servidor usa 90d. */
    since?: string,
  ): Promise<SpotifyPlaysResponse> {
    const params = new URLSearchParams({ group, limit: String(limit) })
    if (since) params.set('since', since)
    return request<SpotifyPlaysResponse>(`/api/spotify/plays?${params}`)
  },
  /** π5: la IA propone 5-8 artistas nuevos basándose en tu perfil
      musical (top artists + géneros). Excluye los que ya tenés en tu
      trama o son tus top. */
  async spotifySuggestArtists(): Promise<SpotifyArtistSuggestionsResponse> {
    return request<SpotifyArtistSuggestionsResponse>(
      '/api/spotify/suggest-artists',
      { method: 'POST', body: '{}' },
    )
  },
  /** π4: timestamps crudos para construir heatmap hora/día y trend
      diario en TZ LOCAL del cliente. */
  async spotifyTiming(since?: string): Promise<SpotifyTimingResponse> {
    const params = new URLSearchParams()
    if (since) params.set('since', since)
    const q = params.toString()
    return request<SpotifyTimingResponse>(
      `/api/spotify/timing${q ? `?${q}` : ''}`,
    )
  },
  /** κ-spotify: snapshot agregado de la paleta musical (top géneros, décadas,
      saved count, párrafo IA). El servidor lo devuelve fresco; el cliente lo
      cachea en localStorage para no re-generar cada vez. */
  async spotifyLibrarySnapshot(): Promise<SpotifyLibrarySnapshot> {
    return request<SpotifyLibrarySnapshot>('/api/spotify/library-snapshot', {
      method: 'POST',
      body: '{}',
    })
  },
  async importSpotifyPlaylist(input: string): Promise<SpotifyPlaylistImport> {
    return request<SpotifyPlaylistImport>('/api/spotify/import-playlist', {
      method: 'POST',
      body: JSON.stringify({ url: input }),
    })
  },
}

// `ExtractionProposal` se reexporta acá sólo para mantener compat de imports.
// Los call sites originalmente importaban algunas cosas relacionadas con
// playlist desde 'src/api'.
export type { ExtractionProposal }
