import type { Config } from '@netlify/functions'
import { buildAuthUrl } from './_lib/spotify/index.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * Kicks off the OAuth flow: redirects the user to Spotify's authorize URL.
 * The state parameter is a CSRF token stored in a short-lived cookie so the
 * callback can verify the redirect came from our own request.
 */
export default withObservability('spotify-login', async () => {
  const state = crypto.randomUUID()
  const url = buildAuthUrl(state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // 10 minutes is plenty for the user to click through Spotify's consent screen.
      'Set-Cookie': `spotify_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  })
})

export const config: Config = {
  path: '/api/spotify/login',
}
