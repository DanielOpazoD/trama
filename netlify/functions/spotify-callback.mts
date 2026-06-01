import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import {
  exchangeCodeForTokens,
  getSpotifyProfile,
  saveTokens,
  SPOTIFY_SCOPES,
} from './_lib/spotify/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { ApiErrors } from './_lib/api-error.js'
import { setCurrentRlsUser } from './_lib/user-rls.js'

/**
 * OAuth callback: Spotify redirects here with ?code=... after the user grants
 * access. We exchange the code for tokens, fetch the user profile, and store
 * everything. Then redirect back to the app.
 */
export default withObservability('spotify-callback', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')

  if (error) {
    return redirectWith(`/?spotify_error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return redirectWith('/?spotify_error=missing_code')
  }

  // Verify CSRF state.
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookies = parseCookies(cookieHeader)
  if (!state || cookies.spotify_state !== state) {
    return redirectWith('/?spotify_error=state_mismatch')
  }

  // Multi-user: el userId viene de la cookie HttpOnly que seteó /login (con el
  // usuario autenticado), NO del state que pasó por Spotify — así no se puede
  // forjar. Si falta, el callback no tiene identidad confiable: rechazamos en
  // vez de caer silenciosamente al legacy owner.
  if (!cookies.spotify_uid) return redirectWith('/?spotify_error=missing_uid')
  const userId = decodeUserCookie(cookies.spotify_uid)
  if (!userId) return redirectWith('/?spotify_error=invalid_uid')
  setCurrentRlsUser(userId)

  const sql = getSql()
  await ensureUserRow(sql, { id: userId })

  const tokens = await exchangeCodeForTokens(code)
  const profile = await getSpotifyProfile(tokens.access_token)

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  await saveTokens(
    sql,
    {
      spotifyUserId: profile?.id ?? null,
      displayName: profile?.display_name ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiresAt,
      scopes: tokens.scope ?? SPOTIFY_SCOPES,
    },
    userId,
  )

  return redirectWith('/?spotify=connected')
})

function redirectWith(location: string): Response {
  const headers = new Headers({ Location: location })
  // Limpia las cookies del flujo (CSRF + userId).
  headers.append('Set-Cookie', 'spotify_state=; Path=/; Max-Age=0')
  headers.append('Set-Cookie', 'spotify_uid=; Path=/; Max-Age=0')
  return new Response(null, { status: 302, headers })
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map((p) => {
      const [k, ...v] = p.trim().split('=')
      return [k, v.join('=')]
    }),
  )
}

function decodeUserCookie(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value).trim()
    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

export const config: Config = {
  path: '/api/spotify/callback',
}
