/**
 * κ-spotify: snapshot de la biblioteca — saved tracks (conteo), top artists
 * y top tracks por rango temporal, más las agregaciones puras (géneros y
 * décadas) que alimentan la vista de "retrato musical".
 */

import { API_BASE } from './client.js'
import {
  SpotifySavedTracksResponse,
  SpotifyTopArtistsResponse,
  SpotifyTopTracksResponse,
} from './schemas.js'

/**
 * Saved-tracks count. Sólo necesitamos el total (no la lista entera), así que
 * pedimos limit=1 y leemos el campo `total` que Spotify devuelve en la primera
 * página. Eso evita paginar miles de tracks innecesariamente.
 */
export async function fetchSavedTracksCount(accessToken: string): Promise<number> {
  const r = await fetch(`${API_BASE}/me/tracks?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    if (r.status === 403) return 0 // scope no autorizado → degradación silenciosa
    const text = await r.text()
    throw new Error(`Spotify /me/tracks failed (${r.status}): ${text}`)
  }
  const body = SpotifySavedTracksResponse.parse(await r.json())
  return Number(body.total ?? 0)
}

export type TopArtistLite = {
  id: string
  name: string
  genres: string[]
  popularity: number
}

/**
 * Top artists del usuario en un rango temporal de Spotify:
 *   - short_term: ~4 semanas
 *   - medium_term: ~6 meses (default)
 *   - long_term: histórico completo (varios años)
 *
 * Devuelve hasta 50 (el max que el endpoint permite). Cada artista trae
 * la lista de géneros que Spotify le asigna — esto es el insumo para
 * agregar "top genres" en el snapshot.
 */
export async function fetchTopArtists(
  accessToken: string,
  timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
): Promise<TopArtistLite[]> {
  const url = new URL(`${API_BASE}/me/top/artists`)
  url.searchParams.set('limit', '50')
  url.searchParams.set('time_range', timeRange)

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    if (r.status === 403) return []
    const text = await r.text()
    throw new Error(`Spotify /me/top/artists failed (${r.status}): ${text}`)
  }
  const body = SpotifyTopArtistsResponse.parse(await r.json())
  return (body.items ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    genres: a.genres ?? [],
    popularity: Number(a.popularity ?? 0),
  }))
}

export type TopTrackLite = {
  id: string
  name: string
  artistNames: string[]
  releaseYear: number | null
  popularity: number
}

export async function fetchTopTracks(
  accessToken: string,
  timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
): Promise<TopTrackLite[]> {
  const url = new URL(`${API_BASE}/me/top/tracks`)
  url.searchParams.set('limit', '50')
  url.searchParams.set('time_range', timeRange)

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    if (r.status === 403) return []
    const text = await r.text()
    throw new Error(`Spotify /me/top/tracks failed (${r.status}): ${text}`)
  }
  const body = SpotifyTopTracksResponse.parse(await r.json())
  return (body.items ?? []).map((t) => {
    const year =
      t.album?.release_date && /^\d{4}/.test(t.album.release_date)
        ? Number.parseInt(t.album.release_date.slice(0, 4), 10)
        : null
    return {
      id: t.id,
      name: t.name,
      artistNames: (t.artists ?? []).map((a) => a.name),
      releaseYear: year,
      popularity: Number(t.popularity ?? 0),
    }
  })
}

/**
 * Agregación pura: dada una lista de top artists con sus géneros, devuelve
 * los géneros con mayor peso. El peso de un género es la suma de
 * `popularity` de cada artista que lo tiene en su lista de géneros, así
 * los géneros que aparecen en artistas más relevantes pesan más.
 *
 * Función pura para que sea fácil testear.
 */
export function aggregateTopGenres(
  artists: Pick<TopArtistLite, 'genres' | 'popularity'>[],
  topN: number = 8,
): Array<{ name: string; weight: number }> {
  const weights = new Map<string, number>()
  for (const a of artists) {
    const pop = Math.max(1, a.popularity)
    for (const g of a.genres ?? []) {
      const key = g.trim().toLowerCase()
      if (!key) continue
      weights.set(key, (weights.get(key) ?? 0) + pop)
    }
  }
  return Array.from(weights.entries())
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN)
}

/**
 * Agregación de la distribución por décadas a partir de top tracks.
 * Devuelve un map "1990s": N, "2000s": N, etc., ordenado por década.
 */
export function aggregateDecades(
  tracks: Pick<TopTrackLite, 'releaseYear'>[],
): Array<{ decade: string; count: number }> {
  const counts = new Map<string, number>()
  for (const t of tracks) {
    if (t.releaseYear == null) continue
    const decade = `${Math.floor(t.releaseYear / 10) * 10}s`
    counts.set(decade, (counts.get(decade) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade.localeCompare(b.decade))
}
