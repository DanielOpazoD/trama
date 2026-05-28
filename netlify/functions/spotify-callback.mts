import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import {
  exchangeCodeForTokens,
  getSpotifyProfile,
  saveTokens,
  SPOTIFY_SCOPES,
} from './_lib/spotify/index.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * OAuth callback: Spotify redirects here with ?code=... after the user grants
 * access. We exchange the code for tokens, fetch the user profile, and store
 * everything. Then redirect back to the app.
 */
export default withObservability('spotify-callback', async (req) => {
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

  const sql = getSql()

  const tokens = await exchangeCodeForTokens(code)
  const profile = await getSpotifyProfile(tokens.access_token)

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  await saveTokens(sql, {
    spotifyUserId: profile?.id ?? null,
    displayName: profile?.display_name ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt,
    scopes: tokens.scope ?? SPOTIFY_SCOPES,
  })

  return redirectWith('/?spotify=connected')
})

function redirectWith(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Clear the CSRF cookie.
      'Set-Cookie': 'spotify_state=; Path=/; Max-Age=0',
    },
  })
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map((p) => {
      const [k, ...v] = p.trim().split('=')
      return [k, v.join('=')]
    }),
  )
}

export const config: Config = {
  path: '/api/spotify/callback',
}
