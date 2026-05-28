/**
 * Spotify OAuth + API helpers.
 *
 * Single-user assumption: there is at most one row in spotify_tokens
 * (id='default'). If/when Trama becomes multi-user, this becomes
 * per-user.
 *
 * Env vars required:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REDIRECT_URI   — must match what's registered in the Spotify app
 */

import type { getSql } from './db.js'
import { ApiErrors } from './api-error.js'

type SqlClient = ReturnType<typeof getSql>

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTH_URL = 'https://accounts.spotify.com/authorize'
const API_BASE = 'https://api.spotify.com/v1'

// Scopes needed to read play history + playlists the user has access to.
// Public playlist tracks are accessible without playlist-read-private, but
// requesting it lets us import the user's own private playlists too.
//
// κ-spotify: user-library-read agregado para acceder a /me/tracks (saved /
// "me gusta"). Si actualizas los scopes después de que el usuario ya conectó
// Spotify, hay que pedirle re-autorizar (Spotify NO agrega scopes
// retroactivamente).
export const SPOTIFY_SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-top-read',
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

export type StoredTokens = {
  id: string
  spotify_user_id: string | null
  display_name: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  scopes: string | null
  connected_at: string
  last_synced_at: string | null
  updated_at: string
}

function readEnv(key: string): string {
  const v = Netlify.env.get(key)
  if (!v) throw new Error(`${key} no está configurada en el entorno`)
  return v
}

export function buildAuthUrl(state: string): string {
  const clientId = readEnv('SPOTIFY_CLIENT_ID')
  const redirectUri = readEnv('SPOTIFY_REDIRECT_URI')
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'true',
  })
  return `${AUTH_URL}?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
  scope: string
  expires_in: number
}

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 * Called once at the end of the OAuth flow.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = readEnv('SPOTIFY_CLIENT_ID')
  const clientSecret = readEnv('SPOTIFY_CLIENT_SECRET')
  const redirectUri = readEnv('SPOTIFY_REDIRECT_URI')

  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spotify token exchange failed (${response.status}): ${text}`)
  }
  return (await response.json()) as TokenResponse
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = readEnv('SPOTIFY_CLIENT_ID')
  const clientSecret = readEnv('SPOTIFY_CLIENT_SECRET')
  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spotify token refresh failed (${response.status}): ${text}`)
  }
  return (await response.json()) as TokenResponse
}

/**
 * Lee el token Spotify almacenado para un usuario.
 *
 * Multi-user: la PK de `spotify_tokens` migró de `id` a `user_id` en la
 * migración 20260526. Sin userId (legacy), usa `id = 'default'`. Con
 * userId, filtra por `user_id = ${userId}` — cada usuario su token.
 *
 * Eventualmente todos los call sites deberían pasar userId; los que
 * no lo hagan caen al legacy row.
 */
export async function getStoredTokens(
  sql: SqlClient,
  userId?: string,
): Promise<StoredTokens | null> {
  const rows = userId
    ? ((await sql`
        SELECT id, spotify_user_id, display_name, access_token, refresh_token,
               expires_at, scopes, connected_at, last_synced_at, updated_at
        FROM spotify_tokens
        WHERE user_id = ${userId}
        LIMIT 1
      `) as StoredTokens[])
    : ((await sql`
        SELECT id, spotify_user_id, display_name, access_token, refresh_token,
               expires_at, scopes, connected_at, last_synced_at, updated_at
        FROM spotify_tokens
        WHERE id = 'default'
        LIMIT 1
      `) as StoredTokens[])
  return rows[0] ?? null
}

/**
 * Persiste tokens Spotify para el usuario actual.
 *
 * Multi-user: si pasás userId, el row se asocia a ese usuario (ON
 * CONFLICT user_id). Sin userId, usa id='default' / legacy-single-user
 * para retro-compat con la versión single-user.
 */
export async function saveTokens(
  sql: SqlClient,
  data: {
    spotifyUserId: string | null
    displayName: string | null
    accessToken: string
    refreshToken: string
    expiresAt: Date
    scopes: string | null
  },
  userId?: string,
): Promise<void> {
  if (userId) {
    await sql`
      INSERT INTO spotify_tokens (
        id, spotify_user_id, display_name, access_token, refresh_token,
        expires_at, scopes, connected_at, updated_at, user_id
      ) VALUES (
        'default',
        ${data.spotifyUserId},
        ${data.displayName},
        ${data.accessToken},
        ${data.refreshToken},
        ${data.expiresAt.toISOString()},
        ${data.scopes},
        NOW(),
        NOW(),
        ${userId}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        spotify_user_id = EXCLUDED.spotify_user_id,
        display_name    = EXCLUDED.display_name,
        access_token    = EXCLUDED.access_token,
        refresh_token   = EXCLUDED.refresh_token,
        expires_at      = EXCLUDED.expires_at,
        scopes          = COALESCE(EXCLUDED.scopes, spotify_tokens.scopes)
    `
    return
  }
  await sql`
    INSERT INTO spotify_tokens (
      id, spotify_user_id, display_name, access_token, refresh_token,
      expires_at, scopes, connected_at, updated_at
    ) VALUES (
      'default',
      ${data.spotifyUserId},
      ${data.displayName},
      ${data.accessToken},
      ${data.refreshToken},
      ${data.expiresAt.toISOString()},
      ${data.scopes},
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      spotify_user_id = EXCLUDED.spotify_user_id,
      display_name    = EXCLUDED.display_name,
      access_token    = EXCLUDED.access_token,
      refresh_token   = EXCLUDED.refresh_token,
      expires_at      = EXCLUDED.expires_at,
      scopes          = COALESCE(EXCLUDED.scopes, spotify_tokens.scopes)
  `
}

/**
 * Get a valid access token, refreshing it if necessary. Updates the stored
 * tokens in the DB on refresh.
 */
export async function getValidAccessToken(
  sql: SqlClient,
  userId?: string,
): Promise<string | null> {
  const stored = await getStoredTokens(sql, userId)
  if (!stored) return null

  const expiresAt = new Date(stored.expires_at).getTime()
  const now = Date.now()
  // Refresh 1 minute before expiry to avoid race conditions.
  if (expiresAt > now + 60_000) return stored.access_token

  const refreshed = await refreshAccessToken(stored.refresh_token)
  const newExpiresAt = new Date(now + refreshed.expires_in * 1000)
  // UPDATE filtra por user_id si vino el param; fallback a id='default'.
  if (userId) {
    await sql`
      UPDATE spotify_tokens
      SET access_token  = ${refreshed.access_token},
          refresh_token = ${refreshed.refresh_token ?? stored.refresh_token},
          expires_at    = ${newExpiresAt.toISOString()}
      WHERE user_id = ${userId}
    `
  } else {
    await sql`
      UPDATE spotify_tokens
      SET access_token  = ${refreshed.access_token},
          refresh_token = ${refreshed.refresh_token ?? stored.refresh_token},
          expires_at    = ${newExpiresAt.toISOString()}
      WHERE id = 'default'
    `
  }
  return refreshed.access_token
}

/**
 * Helper que centraliza el patrón "endpoint Spotify que requiere conexión":
 * obtiene un access token válido, y si no hay (Spotify no conectado o token
 * sin refresh), devuelve un `{ ok: false, response }` con el 400 canónico
 * de ApiErrors.
 *
 * Patrón discriminated union, igual que `parseJsonBody` — el caller hace:
 *
 *     const conn = await requireSpotifyConnection({ sql, userId, requestId })
 *     if (!conn.ok) return conn.response
 *     const accessToken = conn.token
 *
 * Antes el patrón estaba repetido en 4 endpoints (spotify-sync,
 * spotify-suggest-artists, spotify-import-playlist, spotify-library-snapshot)
 * con strings de mensaje ligeramente distintas. Centralizar acá significa
 * que evolucionar el copy o el code path es un cambio de un solo file.
 */
export type SpotifyConnectionResult =
  | { ok: true; token: string }
  | { ok: false; response: Response }

export async function requireSpotifyConnection(opts: {
  sql: SqlClient
  userId: string | undefined
  requestId: string
  /** Mensaje a mostrar si no hay conexión. Default suficiente para casi
   *  todos los call sites. */
  message?: string
}): Promise<SpotifyConnectionResult> {
  const token = await getValidAccessToken(opts.sql, opts.userId)
  if (!token) {
    return {
      ok: false,
      response: ApiErrors.validation(
        opts.requestId,
        opts.message ?? 'Spotify no está conectado',
      ),
    }
  }
  return { ok: true, token }
}

/**
 * Fetch the Spotify user's profile (used to display "Conectado como X").
 */
export async function getSpotifyProfile(
  accessToken: string,
): Promise<{ id: string; display_name: string | null } | null> {
  const r = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) return null
  return (await r.json()) as { id: string; display_name: string | null }
}

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
  userId?: string,
): Promise<number> {
  let inserted = 0
  for (const item of items) {
    const artistIds = item.track.artists.map((a) => a.id)
    const artistNames = item.track.artists.map((a) => a.name)
    // user_id se completa con DEFAULT 'legacy-single-user' si no se pasa
    // (schema migración). En multi-user, cada play se attribuye al user
    // que disparó el sync.
    const result = userId
      ? ((await sql`
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
        `) as Array<{ id: string }>)
      : ((await sql`
          INSERT INTO spotify_plays (
            track_id, track_name, artist_ids, artist_names,
            album_id, album_name, duration_ms, played_at
          ) VALUES (
            ${item.track.id},
            ${item.track.name},
            ${artistIds},
            ${artistNames},
            ${item.track.album.id},
            ${item.track.album.name},
            ${item.track.duration_ms},
            ${item.played_at}
          )
          ON CONFLICT (track_id, played_at) DO NOTHING
          RETURNING id
        `) as Array<{ id: string }>)
    if (result.length > 0) inserted++
  }
  return inserted
}

export async function markSynced(sql: SqlClient, userId?: string): Promise<void> {
  if (userId) {
    await sql`UPDATE spotify_tokens SET last_synced_at = NOW() WHERE user_id = ${userId}`
  } else {
    await sql`UPDATE spotify_tokens SET last_synced_at = NOW() WHERE id = 'default'`
  }
}

export async function disconnectSpotify(sql: SqlClient, userId?: string): Promise<void> {
  if (userId) {
    await sql`DELETE FROM spotify_tokens WHERE user_id = ${userId}`
  } else {
    await sql`DELETE FROM spotify_tokens WHERE id = 'default'`
  }
}

// ---------- Playlist import ----------

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
  if (uriMatch) return uriMatch[1]

  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.indexOf('playlist')
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
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

  type PlaylistResp = {
    name: string
    description: string | null
    owner: { display_name?: string; id: string }
    tracks: {
      total: number
      next: string | null
      items: PlaylistTrackItem[]
    }
  }
  type PlaylistTrackItem = {
    added_at: string | null
    track: SpotifyTrackFull | null
  }
  type SpotifyTrackFull = {
    id: string | null
    name: string
    duration_ms: number
    external_urls: { spotify?: string }
    artists: Array<{ id: string; name: string; external_urls: { spotify?: string } }>
    album: {
      id: string
      name: string
      release_date: string
      external_urls: { spotify?: string }
    }
  }

  const initial = await fetch(`${API_BASE}/playlists/${playlistId}`, { headers })
  if (!initial.ok) {
    const text = await initial.text()
    throw new Error(`Spotify playlist fetch failed (${initial.status}): ${text}`)
  }
  const playlist = (await initial.json()) as PlaylistResp

  const items: PlaylistTrackItem[] = [...playlist.tracks.items]
  let next = playlist.tracks.next
  while (next && items.length < maxTracks) {
    const r = await fetch(next, { headers })
    if (!r.ok) break
    const page = (await r.json()) as { items: PlaylistTrackItem[]; next: string | null }
    items.push(...page.items)
    next = page.next
  }

  const tracks: SpotifyTrackLite[] = items
    .map((it) => it.track && it.track.id ? { it, track: it.track } : null)
    .filter((x): x is { it: PlaylistTrackItem; track: NonNullable<PlaylistTrackItem['track']> } => x !== null)
    .slice(0, maxTracks)
    .map(({ it, track }) => ({
      trackId: track.id ?? '',
      trackName: track.name,
      trackUrl: track.external_urls.spotify ?? `https://open.spotify.com/track/${track.id}`,
      artists: track.artists.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.external_urls.spotify ?? `https://open.spotify.com/artist/${a.id}`,
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        url: track.album.external_urls.spotify ?? `https://open.spotify.com/album/${track.album.id}`,
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

// ---------- κ-spotify: library snapshot (saved tracks + top artists) ----------

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
  const body = (await r.json()) as { total?: number }
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
  const body = (await r.json()) as {
    items?: Array<{ id: string; name: string; genres: string[]; popularity: number }>
  }
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
  const body = (await r.json()) as {
    items?: Array<{
      id: string
      name: string
      artists: Array<{ name: string }>
      album: { release_date?: string }
      popularity: number
    }>
  }
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
