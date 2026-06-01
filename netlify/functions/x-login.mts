import type { Config, Context } from '@netlify/functions'
import { buildAuthUrl, generatePkce, isXConfigured } from './_lib/x/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Arranca el OAuth2 (PKCE) de X. Devuelve la authorize URL como JSON (el front
 * la navega). Setea 3 cookies HttpOnly que el callback necesita:
 *   - x_state    (CSRF)
 *   - x_verifier (PKCE code_verifier — secreto, NUNCA va a X)
 *   - x_uid      (el userId autenticado, para asociar el token al usuario)
 */
export default withObservability(
  'x-login',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'GET') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    // Si faltan las claves (feature inerte), error claro en vez de un 500.
    if (!isXConfigured()) {
      return ApiErrors.validation(
        requestId,
        'X no está configurado en el servidor. Falta definir X_CLIENT_ID, X_CLIENT_SECRET y X_REDIRECT_URI.',
      )
    }
    const { id: userId } = await getAuthedUser(req)
    const state = crypto.randomUUID()
    const { verifier, challenge } = await generatePkce()
    const url = buildAuthUrl(state, challenge)

    const headers = new Headers({ 'Content-Type': 'application/json' })
    const opts = oauthCookieOptions(req)
    headers.append('Set-Cookie', `x_state=${state}; ${opts}`)
    headers.append('Set-Cookie', `x_verifier=${verifier}; ${opts}`)
    headers.append('Set-Cookie', `x_uid=${encodeURIComponent(userId)}; ${opts}`)
    return new Response(JSON.stringify({ url }), { status: 200, headers })
  },
)

export const config: Config = {
  path: '/api/x/login',
}

function oauthCookieOptions(req: Request): string {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`
}
