import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import {
  exchangeCodeForTokens,
  getXProfile,
  saveTokens,
  X_SCOPES,
} from './_lib/x/index.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

/**
 * Callback OAuth2 de X. Verifica el state (CSRF), intercambia el code usando el
 * code_verifier de la cookie (PKCE), trae el perfil y guarda los tokens
 * asociados al usuario (cookie x_uid). El userId NO viaja por X → no se forja.
 */
export default withObservability('x-callback', async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')

  if (error) return redirectWith(`/?x_error=${encodeURIComponent(error)}`)
  if (!code) return redirectWith('/?x_error=missing_code')

  const cookies = parseCookies(req.headers.get('cookie') ?? '')
  if (!state || cookies.x_state !== state) return redirectWith('/?x_error=state_mismatch')
  const verifier = cookies.x_verifier
  if (!verifier) return redirectWith('/?x_error=missing_verifier')
  if (!cookies.x_uid) return redirectWith('/?x_error=missing_uid')
  const userId = decodeURIComponent(cookies.x_uid)

  const sql = getSql()
  await ensureUserRow(sql, { id: userId })
  const tokens = await exchangeCodeForTokens(code, verifier)
  const profile = await getXProfile(tokens.access_token)
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  await saveTokens(
    sql,
    {
      xUserId: profile?.id ?? null,
      username: profile?.username ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      scopes: tokens.scope ?? X_SCOPES,
    },
    userId,
  )
  return redirectWith('/?x=connected')
})

function redirectWith(location: string): Response {
  const headers = new Headers({ Location: location })
  for (const c of ['x_state', 'x_verifier', 'x_uid']) {
    headers.append('Set-Cookie', `${c}=; Path=/; Max-Age=0`)
  }
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

export const config: Config = {
  path: '/api/x/callback',
}
