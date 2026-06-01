// @vitest-environment node
// Forzamos env node (undici real): happy-dom no maneja bien los Set-Cookie,
// y este test verifica justamente las cookies del flujo OAuth.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

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
function reqWithCookie(url: string, cookie: string, method = 'GET'): Request {
  return {
    url,
    method,
    headers: { get: (k: string) => (k.toLowerCase() === 'cookie' ? cookie : null) },
  } as unknown as Request
}

function spotifyHelperSource(file: string): string {
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'spotify', file),
    'utf8',
  )
}

describe('spotify-login — userId en cookie', () => {
  it('rechaza métodos no GET sin crear cookies OAuth', async () => {
    const res = await loginHandler(
      new Request('http://localhost/api/spotify/login', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

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
  it('rechaza métodos no GET antes de intercambiar tokens', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/spotify/callback?code=abc&state=OK',
        'spotify_state=OK; spotify_uid=u1',
        'POST',
      ),
      mockContext(),
    )

    expect(res.status).toBe(405)
    expect(saveTokens).not.toHaveBeenCalled()
  })

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
    expect(mockSqlState.calls.some((c) => /INSERT INTO users/i.test(c.template))).toBe(
      true,
    )
  })

  it('rechaza si el callback no trae spotify_uid', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/spotify/callback?code=abc&state=OK',
        'spotify_state=OK',
      ),
      mockContext(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('missing_uid')
    expect(saveTokens).not.toHaveBeenCalled()
  })

  it('rechaza spotify_uid corrupto o vacío sin convertir el callback en 500', async () => {
    for (const uid of ['%E0%A4%A', '%20%20']) {
      const res = await callbackHandler(
        reqWithCookie(
          'http://localhost/api/spotify/callback?code=abc&state=OK',
          `spotify_state=OK; spotify_uid=${uid}`,
        ),
        mockContext(),
      )

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toContain('invalid_uid')
    }
    expect(saveTokens).not.toHaveBeenCalled()
  })
})

describe('spotify-scheduled-sync — itera por usuario', () => {
  it('rechaza GET con 405 antes de tocar tokens', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }])

    const res = await scheduledSync(
      new Request('http://localhost/api/spotify/scheduled-sync'),
    )

    expect(res.status).toBe(405)
    expect(getValidAccessToken).not.toHaveBeenCalled()
    expect(markSynced).not.toHaveBeenCalled()
  })

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

describe('spotify helpers — no fallback implícito a default', () => {
  it('requieren userId explícito en tokens, plays y estado', () => {
    const authSrc = spotifyHelperSource('auth.ts')
    const syncSrc = spotifyHelperSource('sync.ts')
    expect(authSrc).not.toMatch(/userId\?:/)
    expect(syncSrc).not.toMatch(/userId\?:/)
    expect(authSrc).not.toMatch(/WHERE\s+id\s*=\s*'default'/i)
    expect(syncSrc).not.toMatch(/WHERE\s+id\s*=\s*'default'/i)
  })
})
