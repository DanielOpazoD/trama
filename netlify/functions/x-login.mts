import type { Config } from '@netlify/functions'
import { buildAuthUrl, generatePkce } from './_lib/x/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Arranca el OAuth2 (PKCE) de X. Devuelve la authorize URL como JSON (el front
 * la navega). Setea 3 cookies HttpOnly que el callback necesita:
 *   - x_state    (CSRF)
 *   - x_verifier (PKCE code_verifier — secreto, NUNCA va a X)
 *   - x_uid      (el userId autenticado, para asociar el token al usuario)
 */
export default withObservability('x-login', async (req) => {
  const { id: userId } = await getAuthedUser(req)
  const state = crypto.randomUUID()
  const { verifier, challenge } = await generatePkce()
  const url = buildAuthUrl(state, challenge)

  const headers = new Headers({ 'Content-Type': 'application/json' })
  const opts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=600'
  headers.append('Set-Cookie', `x_state=${state}; ${opts}`)
  headers.append('Set-Cookie', `x_verifier=${verifier}; ${opts}`)
  headers.append('Set-Cookie', `x_uid=${encodeURIComponent(userId)}; ${opts}`)
  return new Response(JSON.stringify({ url }), { status: 200, headers })
})

export const config: Config = {
  path: '/api/x/login',
}
