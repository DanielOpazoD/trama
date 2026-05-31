import type { Config } from '@netlify/functions'
import { buildAuthUrl } from './_lib/spotify/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { getAuthedUser } from './_lib/auth.js'
import { ApiErrors } from './_lib/api-error.js'

/**
 * Arranca el flujo OAuth de Spotify. Devuelve la authorize URL como JSON (el
 * front la navega) — antes era un 302 directo, pero así podemos AUTENTICAR al
 * usuario por Bearer y llevar su identidad al callback.
 *
 * Multi-user: el `userId` viaja en una cookie HttpOnly seteada acá (con el
 * usuario ya autenticado). El callback la lee — así el userId NUNCA pasa por
 * Spotify y no se puede forjar desde el cliente. El `state` es solo CSRF.
 * En single-user, getAuthedUser cae a 'legacy-single-user'.
 */
export default withObservability('spotify-login', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const { id: userId } = await getAuthedUser(req)
  const state = crypto.randomUUID()
  const url = buildAuthUrl(state)

  const headers = new Headers({ 'Content-Type': 'application/json' })
  // 10 minutos alcanza para pasar por la pantalla de consentimiento de Spotify.
  const opts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=600'
  headers.append('Set-Cookie', `spotify_state=${state}; ${opts}`)
  headers.append('Set-Cookie', `spotify_uid=${encodeURIComponent(userId)}; ${opts}`)

  return new Response(JSON.stringify({ url }), { status: 200, headers })
})

export const config: Config = {
  path: '/api/spotify/login',
}
