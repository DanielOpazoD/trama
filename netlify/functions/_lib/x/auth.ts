/**
 * OAuth2 (Authorization Code + PKCE) de X (Twitter) + gestión de tokens.
 *
 * X usa OAuth2 con PKCE (a diferencia del flujo de Spotify): el /login genera
 * un code_verifier, manda su SHA-256 (code_challenge) a X, y el /callback
 * intercambia el code usando el verifier. El verifier viaja en una cookie
 * HttpOnly entre login y callback. `offline.access` habilita refresh_token.
 *
 * Multi-user: x_tokens tiene PK user_id; cada usuario su token.
 */

import { API_BASE, AUTH_URL, TOKEN_URL, readEnv, type SqlClient } from './client.js'

// Scopes: leer tweets + perfil + bookmarks, y offline.access para refresh.
//
// DIAGNÓSTICO TEMPORAL (2026-05): quitamos `bookmark.read` para aislar si el
// 400 de X en /oauth2/authorize viene de ese scope (la API de Bookmarks exige
// tier de pago). Si la conexión funciona sin él, confirmamos la causa.
// → RESTAURAR a 'tweet.read users.read bookmark.read offline.access' después.
export const X_SCOPES = 'tweet.read users.read offline.access'

export type StoredXTokens = {
  user_id: string
  x_user_id: string | null
  username: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string
  scopes: string | null
  connected_at: string
  last_synced_at: string | null
  updated_at: string
}

// ---------- PKCE ----------

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Genera el par PKCE: verifier (secreto, va en cookie) + challenge (a X). */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(digest) }
}

export function buildAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: readEnv('X_CLIENT_ID'),
    redirect_uri: readEnv('X_REDIRECT_URI'),
    scope: X_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTH_URL}?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
  scope?: string
  expires_in: number
}

function basicAuth(): string {
  return btoa(`${readEnv('X_CLIENT_ID')}:${readEnv('X_CLIENT_SECRET')}`)
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: readEnv('X_REDIRECT_URI'),
    code_verifier: codeVerifier,
    client_id: readEnv('X_CLIENT_ID'),
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth()}`,
    },
    body,
  })
  if (!res.ok) {
    throw new Error(`X token exchange failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as TokenResponse
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: readEnv('X_CLIENT_ID'),
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth()}`,
    },
    body,
  })
  if (!res.ok) {
    throw new Error(`X token refresh failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as TokenResponse
}

export async function getStoredTokens(
  sql: SqlClient,
  userId: string,
): Promise<StoredXTokens | null> {
  const rows = (await sql`
    SELECT user_id, x_user_id, username, access_token, refresh_token,
           expires_at, scopes, connected_at, last_synced_at, updated_at
    FROM x_tokens
    WHERE user_id = ${userId}
    LIMIT 1
  `) as StoredXTokens[]
  return rows[0] ?? null
}

export async function saveTokens(
  sql: SqlClient,
  data: {
    xUserId: string | null
    username: string | null
    accessToken: string
    refreshToken: string | null
    expiresAt: Date
    scopes: string | null
  },
  userId: string,
): Promise<void> {
  await sql`
    INSERT INTO x_tokens (
      user_id, x_user_id, username, access_token, refresh_token,
      expires_at, scopes, connected_at, updated_at
    ) VALUES (
      ${userId},
      ${data.xUserId},
      ${data.username},
      ${data.accessToken},
      ${data.refreshToken},
      ${data.expiresAt.toISOString()},
      ${data.scopes},
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      x_user_id     = EXCLUDED.x_user_id,
      username      = EXCLUDED.username,
      access_token  = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, x_tokens.refresh_token),
      expires_at    = EXCLUDED.expires_at,
      scopes        = COALESCE(EXCLUDED.scopes, x_tokens.scopes)
  `
}

/** Access token válido, refrescándolo si está por vencer. */
export async function getValidAccessToken(
  sql: SqlClient,
  userId: string,
): Promise<string | null> {
  const stored = await getStoredTokens(sql, userId)
  if (!stored) return null

  const expiresAt = new Date(stored.expires_at).getTime()
  if (expiresAt > Date.now() + 60_000) return stored.access_token
  if (!stored.refresh_token) return null

  const refreshed = await refreshAccessToken(stored.refresh_token)
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
  await sql`
    UPDATE x_tokens
    SET access_token  = ${refreshed.access_token},
        refresh_token = ${refreshed.refresh_token ?? stored.refresh_token},
        expires_at    = ${newExpiresAt.toISOString()}
    WHERE user_id = ${userId}
  `
  return refreshed.access_token
}

export async function markSynced(sql: SqlClient, userId: string): Promise<void> {
  await sql`UPDATE x_tokens SET last_synced_at = NOW() WHERE user_id = ${userId}`
}

export async function disconnectX(sql: SqlClient, userId: string): Promise<void> {
  await sql`DELETE FROM x_tokens WHERE user_id = ${userId}`
}

/** Perfil de la cuenta conectada (para "Conectado como @x"). */
export async function getXProfile(
  accessToken: string,
): Promise<{ id: string; username: string; name: string | null } | null> {
  const r = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) return null
  const data = (await r.json()) as {
    data?: { id: string; username: string; name?: string | null }
  }
  if (!data.data) return null
  return { id: data.data.id, username: data.data.username, name: data.data.name ?? null }
}
