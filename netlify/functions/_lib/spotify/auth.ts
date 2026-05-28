/**
 * Spotify OAuth + gestión de tokens.
 *
 * Single-user assumption (legacy): hay a lo sumo una fila en spotify_tokens
 * con id='default'. Multi-user: la PK migró a `user_id` (migración 20260526);
 * cada usuario tiene su token. Los call sites que pasen userId quedan
 * aislados por usuario; los que no, caen a la fila legacy.
 */

import { ApiErrors } from '../api-error.js'
import { API_BASE, AUTH_URL, TOKEN_URL, readEnv, type SqlClient } from './client.js'

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
