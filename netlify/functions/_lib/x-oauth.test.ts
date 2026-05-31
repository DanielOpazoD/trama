// @vitest-environment node
// env node (undici real): happy-dom no maneja bien los Set-Cookie del OAuth.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// Spies del barrel de X (vi.hoisted: vi.mock se eleva sobre las const).
const {
  exchangeCodeForTokens,
  getXProfile,
  saveTokens,
  getStoredTokens,
  getValidAccessToken,
  fetchBookmarks,
  storeBookmarks,
  markSynced,
  disconnectX,
  isXConfigured,
  runClassify,
  XApiError,
} = vi.hoisted(() => {
  // x-sync hace `err instanceof XApiError`: el mock debe exponer una clase con
  // la misma forma (status + body). Va en hoisted para estar inicializada
  // cuando corre el factory de vi.mock (que se eleva sobre las const).
  class XApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: string,
    ) {
      super(`X API ${status}`)
      this.name = 'XApiError'
    }
  }
  return {
    exchangeCodeForTokens: vi.fn(async () => ({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: 'bookmark.read',
      token_type: 'bearer',
    })),
    getXProfile: vi.fn(async () => ({ id: 'x-1', username: 'daniel', name: 'Daniel' })),
    saveTokens: vi.fn(async () => {}),
    getStoredTokens: vi.fn(async () => null as unknown),
    getValidAccessToken: vi.fn(async () => 'access-token'),
    fetchBookmarks: vi.fn(async () => [{ tweetId: 't1' }, { tweetId: 't2' }]),
    storeBookmarks: vi.fn(async () => 2),
    markSynced: vi.fn(async () => {}),
    disconnectX: vi.fn(async () => {}),
    isXConfigured: vi.fn(() => true),
    runClassify: vi.fn(async () => ({ classified: 2, remaining: false })),
    XApiError,
  }
})
vi.mock('./x/index.js', () => ({
  X_SCOPES: 'tweet.read users.read bookmark.read offline.access',
  buildAuthUrl: (state: string, challenge: string) =>
    `https://twitter.com/i/oauth2/authorize?state=${state}&code_challenge=${challenge}`,
  generatePkce: async () => ({ verifier: 'VERIFIER', challenge: 'CHALLENGE' }),
  isXConfigured,
  exchangeCodeForTokens,
  getXProfile,
  saveTokens,
  getStoredTokens,
  getValidAccessToken,
  fetchBookmarks,
  storeBookmarks,
  markSynced,
  disconnectX,
  runClassify,
  XApiError,
}))
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: vi.fn(async () => null) }))
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: vi.fn(async () => ({
    kind: 'ready',
    provider: 'openai',
    model: null,
    verifyWith: null,
  })),
  aiOffResponse: () =>
    Response.json(
      {
        error: {
          code: 'AI_DISABLED',
          message: 'IA deshabilitada por el usuario (modo Off).',
          requestId: 'rid-test',
        },
      },
      { status: 423 },
    ),
}))

import loginHandler from '../x-login'
import callbackHandler from '../x-callback'
import statusHandler from '../x-status'
import syncHandler from '../x-sync'
import scheduledHandler from '../x-scheduled-sync'

function reqWithCookie(url: string, cookie: string): Request {
  return {
    url,
    headers: { get: (k: string) => (k.toLowerCase() === 'cookie' ? cookie : null) },
  } as unknown as Request
}

beforeEach(() => {
  mockSqlResponses.reset()
  for (const m of [
    exchangeCodeForTokens,
    saveTokens,
    getStoredTokens,
    getValidAccessToken,
    fetchBookmarks,
    storeBookmarks,
    markSynced,
  ]) {
    m.mockClear()
  }
  getStoredTokens.mockResolvedValue(null as unknown)
  isXConfigured.mockReturnValue(true)
})
afterEach(() => vi.unstubAllGlobals())

describe('x-login', () => {
  it('devuelve {url} y setea cookies x_state + x_verifier + x_uid', async () => {
    const res = await loginHandler(
      new Request('http://localhost/api/x/login'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).url).toContain('twitter.com/i/oauth2/authorize')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('x_state=')
    expect(setCookie).toContain('x_verifier=VERIFIER')
    expect(setCookie).toContain('x_uid=legacy-single-user')
    expect(setCookie).toMatch(/HttpOnly/i)
  })

  it('400 (no 500) cuando X no está configurado', async () => {
    isXConfigured.mockReturnValue(false)
    const res = await loginHandler(
      new Request('http://localhost/api/x/login'),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.message).toMatch(/no está configurado/i)
  })
})

describe('x-callback', () => {
  it('state_mismatch si el state no coincide', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/x/callback?code=c&state=AAA',
        'x_state=BBB; x_verifier=V; x_uid=u1',
      ),
      mockContext(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('state_mismatch')
    expect(saveTokens).not.toHaveBeenCalled()
  })

  it('intercambia con el verifier y asocia el token al userId de la cookie', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/x/callback?code=the-code&state=OK',
        'x_state=OK; x_verifier=the-verifier; x_uid=user-9',
      ),
      mockContext(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('x=connected')
    expect(exchangeCodeForTokens).toHaveBeenCalledWith('the-code', 'the-verifier')
    expect(saveTokens.mock.calls[0]![2]).toBe('user-9')
    expect(mockSqlState.calls.some((c) => /INSERT INTO users/i.test(c.template))).toBe(
      true,
    )
  })

  it('rechaza si el callback no trae x_uid', async () => {
    const res = await callbackHandler(
      reqWithCookie(
        'http://localhost/api/x/callback?code=the-code&state=OK',
        'x_state=OK; x_verifier=the-verifier',
      ),
      mockContext(),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('missing_uid')
    expect(exchangeCodeForTokens).not.toHaveBeenCalled()
    expect(saveTokens).not.toHaveBeenCalled()
  })
})

describe('x-sync', () => {
  it('400 si X no está conectado', async () => {
    getStoredTokens.mockResolvedValue(null as unknown)
    const res = await syncHandler(
      new Request('http://localhost/api/x/sync', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('trae y guarda bookmarks → {fetched, inserted}', async () => {
    getStoredTokens.mockResolvedValue({ x_user_id: 'x-1' } as unknown)
    const res = await syncHandler(
      new Request('http://localhost/api/x/sync', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fetched: 2, inserted: 2, classified: 2 })
    expect(markSynced).toHaveBeenCalledOnce()
    expect(runClassify).toHaveBeenCalledOnce()
  })

  it('403 de X (sin permiso/tier) → 422 con la razón que devuelve X', async () => {
    getStoredTokens.mockResolvedValue({ x_user_id: 'x-1' } as unknown)
    fetchBookmarks.mockRejectedValueOnce(
      new XApiError(
        403,
        JSON.stringify({ title: 'Client Forbidden', reason: 'client-not-enrolled' }),
      ),
    )
    const res = await syncHandler(
      new Request('http://localhost/api/x/sync', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.message).toContain('Client Forbidden')
    expect(body.error.message).toContain('client-not-enrolled')
  })
})

describe('x-status', () => {
  it('connected:true con conteo de bookmarks', async () => {
    getStoredTokens.mockResolvedValue({
      username: 'daniel',
      x_user_id: 'x-1',
      last_synced_at: null,
    } as unknown)
    mockSqlResponses.push([{ c: 5 }]) // COUNT bookmarks
    const res = await statusHandler(
      new Request('http://localhost/api/x/status'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connected).toBe(true)
    expect(body.counts.totalBookmarks).toBe(5)
  })
})

describe('x-scheduled-sync (cron)', () => {
  it('rechaza GET con 405 antes de tocar tokens', async () => {
    mockSqlResponses.push([{ user_id: 'u1', x_user_id: 'x-1' }])

    const res = await scheduledHandler(new Request('http://localhost/x-scheduled-sync'))

    expect(res.status).toBe(405)
    expect(getValidAccessToken).not.toHaveBeenCalled()
    expect(storeBookmarks).not.toHaveBeenCalled()
  })

  it('sincroniza a cada usuario con token', async () => {
    mockSqlResponses.push([{ user_id: 'u1', x_user_id: 'x-1' }]) // SELECT x_tokens
    const res = await scheduledHandler(
      new Request('http://localhost/x-scheduled-sync', { method: 'POST', body: '{}' }),
    )
    expect(res.status).toBe(202)
    expect(storeBookmarks).toHaveBeenCalled()
    expect(markSynced).toHaveBeenCalled()
  })

  it('no hace nada si no hay tokens', async () => {
    mockSqlResponses.push([]) // SELECT x_tokens vacío
    const res = await scheduledHandler(
      new Request('http://localhost/x-scheduled-sync', { method: 'POST', body: '{}' }),
    )
    expect(res.status).toBe(202)
    expect(storeBookmarks).not.toHaveBeenCalled()
  })
})
