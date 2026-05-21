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

type SqlClient = ReturnType<typeof getSql>

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTH_URL = 'https://accounts.spotify.com/authorize'
const API_BASE = 'https://api.spotify.com/v1'

// Scopes needed to read play history.
export const SPOTIFY_SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-top-read',
  'user-read-private',
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

export async function getStoredTokens(sql: SqlClient): Promise<StoredTokens | null> {
  const rows = (await sql`
    SELECT id, spotify_user_id, display_name, access_token, refresh_token,
           expires_at, scopes, connected_at, last_synced_at, updated_at
    FROM spotify_tokens
    WHERE id = 'default'
    LIMIT 1
  `) as StoredTokens[]
  return rows[0] ?? null
}

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
): Promise<void> {
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
    ON CONFLICT (id) DO UPDATE SET
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
export async function getValidAccessToken(sql: SqlClient): Promise<string | null> {
  const stored = await getStoredTokens(sql)
  if (!stored) return null

  const expiresAt = new Date(stored.expires_at).getTime()
  const now = Date.now()
  // Refresh 1 minute before expiry to avoid race conditions.
  if (expiresAt > now + 60_000) return stored.access_token

  const refreshed = await refreshAccessToken(stored.refresh_token)
  const newExpiresAt = new Date(now + refreshed.expires_in * 1000)
  await sql`
    UPDATE spotify_tokens
    SET access_token  = ${refreshed.access_token},
        refresh_token = ${refreshed.refresh_token ?? stored.refresh_token},
        expires_at    = ${newExpiresAt.toISOString()}
    WHERE id = 'default'
  `
  return refreshed.access_token
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
): Promise<number> {
  let inserted = 0
  for (const item of items) {
    const artistIds = item.track.artists.map((a) => a.id)
    const artistNames = item.track.artists.map((a) => a.name)
    const result = await sql`
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
    ` as Array<{ id: string }>
    if (result.length > 0) inserted++
  }
  return inserted
}

export async function markSynced(sql: SqlClient): Promise<void> {
  await sql`UPDATE spotify_tokens SET last_synced_at = NOW() WHERE id = 'default'`
}

export async function disconnectSpotify(sql: SqlClient): Promise<void> {
  await sql`DELETE FROM spotify_tokens WHERE id = 'default'`
}
