import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const snapshotMocks = vi.hoisted(() => ({
  askLLMForText: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
  requireSpotifyConnection: vi.fn(),
  fetchSavedTracksCount: vi.fn(),
  fetchTopArtists: vi.fn(),
  fetchTopTracks: vi.fn(),
  aggregateTopGenres: vi.fn(),
  aggregateDecades: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForText: snapshotMocks.askLLMForText,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: snapshotMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: snapshotMocks.checkMonthlyBudget,
}))

vi.mock('./spotify/index.js', () => ({
  requireSpotifyConnection: snapshotMocks.requireSpotifyConnection,
  fetchSavedTracksCount: snapshotMocks.fetchSavedTracksCount,
  fetchTopArtists: snapshotMocks.fetchTopArtists,
  fetchTopTracks: snapshotMocks.fetchTopTracks,
  aggregateTopGenres: snapshotMocks.aggregateTopGenres,
  aggregateDecades: snapshotMocks.aggregateDecades,
}))

import handler from '../spotify-library-snapshot'

const usage = {
  provider: 'openai',
  model: 'gpt',
  tokensIn: 20,
  tokensOut: 10,
  costCents: 1.1,
  durationMs: 60,
}

const topArtists = [
  { name: 'Miles Davis', popularity: 80, genres: ['jazz', 'bebop'] },
  { name: 'Björk', popularity: 75, genres: ['art pop'] },
  { name: 'Talk Talk', popularity: 60, genres: ['post-rock'] },
]

const topTracks = [
  {
    name: 'Blue in Green',
    artistNames: ['Miles Davis'],
    releaseYear: 1959,
  },
]

describe('spotify-library-snapshot endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(snapshotMocks)) mock.mockReset()
    snapshotMocks.requireSpotifyConnection.mockResolvedValue({ ok: true, token: 'token' })
    snapshotMocks.fetchSavedTracksCount.mockResolvedValue(42)
    snapshotMocks.fetchTopArtists.mockResolvedValue(topArtists)
    snapshotMocks.fetchTopTracks.mockResolvedValue(topTracks)
    snapshotMocks.aggregateTopGenres.mockReturnValue([
      { name: 'jazz', weight: 80 },
      { name: 'art pop', weight: 75 },
    ])
    snapshotMocks.aggregateDecades.mockReturnValue([{ decade: '1950s', count: 1 }])
    snapshotMocks.checkMonthlyBudget.mockResolvedValue(null)
    snapshotMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
    snapshotMocks.askLLMForText.mockResolvedValue({
      content: '  Una paleta nocturna y elástica.  ',
      usage,
      fromCache: false,
    })
  })

  it('rechaza métodos no POST con ApiErrors', async () => {
    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot'),
      mockContext(),
    )

    expect(res.status).toBe(405)
    expect(await res.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } })
  })

  it('propaga respuesta de Spotify no conectado', async () => {
    snapshotMocks.requireSpotifyConnection.mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: { code: 'SPOTIFY_NOT_CONNECTED' } },
        { status: 400 },
      ),
    })
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: { code: 'SPOTIFY_NOT_CONNECTED' } })
    expect(snapshotMocks.fetchTopArtists).not.toHaveBeenCalled()
  })

  it('devuelve agregado sin IA cuando no hay datos significativos', async () => {
    snapshotMocks.fetchSavedTracksCount.mockResolvedValueOnce(0)
    snapshotMocks.fetchTopArtists.mockResolvedValueOnce([])
    snapshotMocks.fetchTopTracks.mockResolvedValueOnce([])
    snapshotMocks.aggregateTopGenres.mockReturnValueOnce([])
    snapshotMocks.aggregateDecades.mockReturnValueOnce([])
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      savedCount: 0,
      topGenres: [],
      topArtists: [],
      topTracks: [],
      decades: [],
      aiSummary: null,
      provider: null,
      model: null,
    })
    expect(snapshotMocks.checkMonthlyBudget).not.toHaveBeenCalled()
    expect(snapshotMocks.askLLMForText).not.toHaveBeenCalled()
  })

  it('degrada sin IA cuando el presupuesto está agotado', async () => {
    snapshotMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      savedCount: 42,
      aiSummary: null,
      provider: null,
      model: null,
    })
    expect(snapshotMocks.resolveAIInvocation).not.toHaveBeenCalled()
  })

  it('respeta modo IA off después de construir el agregado', async () => {
    snapshotMocks.resolveAIInvocation.mockResolvedValueOnce({ kind: 'off' })
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(423)
    expect(snapshotMocks.askLLMForText).not.toHaveBeenCalled()
  })

  it('genera resumen IA y registra extraction_log con user_id', async () => {
    mockSqlResponses.push([], [])

    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      savedCount: 42,
      topGenres: [
        { name: 'jazz', weight: 80 },
        { name: 'art pop', weight: 75 },
      ],
      topArtists: [
        { name: 'Miles Davis', popularity: 80, genres: ['jazz', 'bebop'] },
        { name: 'Björk', popularity: 75, genres: ['art pop'] },
        { name: 'Talk Talk', popularity: 60, genres: ['post-rock'] },
      ],
      topTracks: [{ name: 'Blue in Green', artists: ['Miles Davis'], year: 1959 }],
      decades: [{ decade: '1950s', count: 1 }],
      aiSummary: 'Una paleta nocturna y elástica.',
      provider: 'openai',
      model: 'gpt',
    })
    expect(snapshotMocks.askLLMForText).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('jazz, art pop'),
        }),
      ]),
      { provider: 'openai', model: 'gpt' },
    )
    const extractionLog = mockSqlState.calls.find((call) =>
      /INSERT INTO extraction_log/i.test(call.template),
    )
    expect(extractionLog?.values).toEqual(
      expect.arrayContaining(['legacy-single-user', 'openai', 'gpt']),
    )
  })

  it('si el LLM falla devuelve la paleta con aiError sin perder datos', async () => {
    snapshotMocks.askLLMForText.mockRejectedValueOnce(new Error('timeout'))
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/library-snapshot', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      savedCount: 42,
      aiSummary: null,
      provider: null,
      model: null,
      aiError: 'timeout',
    })
  })
})
