// @vitest-environment node
// Forzamos env node (undici real): happy-dom no maneja bien los Set-Cookie,
// y este test verifica justamente las cookies del flujo OAuth.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// Mock del barrel de Spotify: evitamos red/env reales y podemos espiar saveTokens
// y getValidAccessToken para verificar el wiring per-usuario. Los spies van por
// vi.hoisted porque vi.mock se eleva por encima de las const.
const { saveTokens, getValidAccessToken, storePlays, markSynced } = vi.hoisted(() => ({
  saveTokens: vi.fn(async () => {}),
  getValidAccessToken: vi.fn(async () => 'access-token'),
  storePlays: vi.fn(async () => 1),
  markSynced: vi.fn(async () => {}),
}))
vi.mock('./spotify/index.js', () => ({
  buildAuthUrl: (state: string) =>
    `https://accounts.spotify.com/authorize?state=${state}`,
  SPOTIFY_SCOPES: 'scope-a scope-b',
  exchangeCodeForTokens: vi.fn(async () => ({
    access_token: 'at',
    refresh_token: 'rt',
    expires_in: 3600,
    scope: 'scope-a',
    token_type: 'Bearer',
  })),
  getSpotifyProfile: vi.fn(async () => ({ id: 'sp-user', display_name: 'Daniel' })),
  saveTokens,
  getValidAccessToken,
  fetchRecentlyPlayed: vi.fn(async () => ({ items: [{ played_at: '2026-01-01' }] })),
  storePlays,
  markSynced,
}))

import loginHandler from '../spotify-login'
import callbackHandler from '../spotify-callback'
import scheduledSync from '../spotify-scheduled-sync'

beforeEach(() => {
  mockSqlResponses.reset()
  saveTokens.mockClear()
  getValidAccessToken.mockClear()
  storePlays.mockClear()
  markSynced.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

/**
 * undici (el fetch de Node) ELIMINA el header `cookie` de un Request construido
 * a mano, así que para los tests del callback usamos un req mínimo con el
 * `headers.get` que necesita el handler (url + cookie). En el runtime real el
 * navegador sí manda la cookie en el redirect de Spotify.
 */
function reqWithCookie(url: string, cookie: string): Request {
  return {
    url,
    headers: { get: (k: string) => (k.toLowerCase() === 'cookie' ? cookie : null) },
  } as unknown as Request
}

describe('spotify-login — userId en cookie', () => {
  it('devuelve {url} y setea cookies spotify_state + spotify_uid', async () => {
    const res = await loginHandler(
      new Request('http://localhost/api/spotify/login'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toContain('accounts.spotify.com/authorize')

    // undici combina los Set-Cookie en un solo header; chequeamos el string.
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('spotify_state=')
    // En tests (sin Clerk) el usuario cae a legacy-single-user.
    expect(setCookie).toContain('spotify_uid=legacy-single-user')
    expect(setCookie).toMatch(/HttpOnly/i)
  })
})

describe('spotify-callback — asocia el token al userId de la cookie', () => {
  it('rechaza con state_mismatch si el state no coincide con la cookie', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/spotify/callback?code=abc&state=XXX',
        'spotify_state=YYY; spotify_uid=u1',
      ),
      mockContext(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('state_mismatch')
    expect(saveTokens).not.toHaveBeenCalled()
  })

  it('pasa el userId de la cookie a saveTokens', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/spotify/callback?code=abc&state=OK',
        'spotify_state=OK; spotify_uid=user-99',
      ),
      mockContext(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('spotify=connected')
    expect(saveTokens).toHaveBeenCalledTimes(1)
    // 3er argumento = userId de la cookie.
    expect(saveTokens.mock.calls[0]![2]).toBe('user-99')
  })
})

describe('spotify-scheduled-sync — itera por usuario', () => {
  it('sincroniza a cada usuario con token (no solo el legacy)', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }, { user_id: 'u2' }]) // SELECT user_id
    const res = await scheduledSync(
      new Request('http://localhost/api/spotify/scheduled-sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(202)
    expect(getValidAccessToken.mock.calls.map((c) => c[1])).toEqual(['u1', 'u2'])
    expect(markSynced.mock.calls.map((c) => c[1])).toEqual(['u1', 'u2'])
  })

  it('no hace nada si no hay tokens', async () => {
    mockSqlResponses.push([]) // SELECT user_id vacío
    const res = await scheduledSync(
      new Request('http://localhost/api/spotify/scheduled-sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(202)
    expect(getValidAccessToken).not.toHaveBeenCalled()
  })
})
