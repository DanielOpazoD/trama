import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
// Netlify.env no existe en el test runtime; stubeamos para evitar
// ReferenceError cuando cost-cap.ts lee AI_MONTHLY_BUDGET_CENTS.
// ALLOW_LEGACY_FALLBACK=true para que getAuthedUser() devuelva el
// usuario legacy en vez de lanzar UnauthenticatedError.
vi.stubGlobal('Netlify', {
  env: {
    get: vi.fn((key: string) =>
      key === 'ALLOW_LEGACY_FALLBACK' ? 'true' : undefined,
    ),
  },
})
// LLM nunca se llega a invocar en estos tests (mock fetch a fail).
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

import handler from '../spotify-suggest-artists'

/**
 * Tests del endpoint de sugerencias de artistas. Mockeamos SQL para
 * cubrir las dos branches sin LLM:
 *   (a) sin token de Spotify → 400 "no conectado"
 *   (b) sin top artists (lista vacía) → 200 con reason editorial
 *
 * El happy path con LLM real es mejor probarlo end-to-end; acá nos
 * enfocamos en validación + fallback.
 */

describe('spotify-suggest-artists endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    // No usamos unstubAllGlobals porque querríamos preservar `Netlify`
    // entre tests; reseteamos solo el fetch.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '',
        json: async () => ({}),
      }),
    )
  })

  it('rechaza método no POST con 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/spotify/suggest-artists', {
        method: 'GET',
      }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('devuelve 400 si Spotify no está conectado (sin token en DB)', async () => {
    // Query 1: checkMonthlyBudget — devuelve [] (sin cost-cap excedido)
    mockSqlResponses.push([])
    // Query 2: getStoredTokens — vacío
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/suggest-artists', {
        method: 'POST',
        body: '{}',
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toMatch(/no está conectado/i)
  })

  it('devuelve {suggestions:[],reason} si fetch a Spotify top-artists falla', async () => {
    // checkMonthlyBudget query
    mockSqlResponses.push([])
    // getStoredTokens query — devolvemos un token "válido"
    mockSqlResponses.push([
      {
        id: 'default',
        spotify_user_id: 'u1',
        display_name: 'Test',
        access_token: 'tok',
        refresh_token: 'ref',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        scopes: 'user-top-read',
        connected_at: '2026-01-01T00:00:00Z',
        last_synced_at: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    // fetch a Spotify /me/top/artists devuelve 403 (sin scope). El handler
    // está marcado para devolver [] en ese caso (catch dentro de fetchTopArtists).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
        json: async () => ({}),
      }),
    )

    const res = await handler(
      new Request('http://localhost/api/spotify/suggest-artists', {
        method: 'POST',
        body: '{}',
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      suggestions: unknown[]
      reason?: string
      provider: string | null
    }
    expect(body.suggestions).toEqual([])
    expect(body.reason).toBeTruthy()
    expect(body.reason).toMatch(/sin top artistas/i)
    expect(body.provider).toBeNull()
  })
})
