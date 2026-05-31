import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const spotifyMocks = vi.hoisted(() => ({
  disconnectSpotify: vi.fn(async () => {}),
  getStoredTokens: vi.fn(),
  requireSpotifyConnection: vi.fn(),
  fetchRecentlyPlayed: vi.fn(),
  storePlays: vi.fn(),
  markSynced: vi.fn(async () => {}),
}))

vi.mock('./spotify/index.js', () => ({
  disconnectSpotify: spotifyMocks.disconnectSpotify,
  getStoredTokens: spotifyMocks.getStoredTokens,
  requireSpotifyConnection: spotifyMocks.requireSpotifyConnection,
  fetchRecentlyPlayed: spotifyMocks.fetchRecentlyPlayed,
  storePlays: spotifyMocks.storePlays,
  markSynced: spotifyMocks.markSynced,
}))

import statusHandler from '../spotify-status'
import syncHandler from '../spotify-sync'

describe('spotify-status endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(spotifyMocks)) mock.mockClear()
  })

  it('devuelve disconnected cuando no hay token', async () => {
    spotifyMocks.getStoredTokens.mockResolvedValue(null)

    const res = await statusHandler(
      new Request('http://localhost/api/spotify/status'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connected: false })
  })

  it('devuelve estado conectado con counts del usuario', async () => {
    spotifyMocks.getStoredTokens.mockResolvedValue({
      spotify_user_id: 'sp-1',
      display_name: 'Daniel',
      connected_at: '2026-01-01',
      last_synced_at: '2026-01-02',
    })
    mockSqlResponses.push([
      { total_plays: '10', unique_tracks: '7', most_recent_play: '2026-01-03' },
    ])

    const res = await statusHandler(
      new Request('http://localhost/api/spotify/status'),
      mockContext(),
    )

    expect(await res.json()).toMatchObject({
      connected: true,
      spotifyUserId: 'sp-1',
      counts: { totalPlays: 10, uniqueTracks: 7, mostRecentPlay: '2026-01-03' },
    })
    expect(mockSqlResponses.calls[0]?.template).toMatch(/WHERE user_id/)
  })

  it('desconecta por DELETE y rechaza métodos no soportados', async () => {
    const deleted = await statusHandler(
      new Request('http://localhost/api/spotify/status', { method: 'DELETE' }),
      mockContext(),
    )
    expect(deleted.status).toBe(204)
    expect(spotifyMocks.disconnectSpotify).toHaveBeenCalledWith(
      expect.any(Function),
      'legacy-single-user',
    )

    const method = await statusHandler(
      new Request('http://localhost/api/spotify/status', { method: 'POST' }),
      mockContext(),
    )
    expect(method.status).toBe(405)
  })
})

describe('spotify-sync endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(spotifyMocks)) mock.mockClear()
  })

  it('sincroniza plays del usuario conectado', async () => {
    spotifyMocks.requireSpotifyConnection.mockResolvedValue({ ok: true, token: 'token' })
    spotifyMocks.fetchRecentlyPlayed.mockResolvedValue({
      items: [{ played_at: '2026-01-04' }, { played_at: '2026-01-03' }],
    })
    spotifyMocks.storePlays.mockResolvedValue(2)

    const res = await syncHandler(
      new Request('http://localhost/api/spotify/sync', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      fetched: 2,
      inserted: 2,
      mostRecentPlay: '2026-01-04',
    })
    expect(spotifyMocks.storePlays).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Array),
      'legacy-single-user',
    )
    expect(spotifyMocks.markSynced).toHaveBeenCalledWith(
      expect.any(Function),
      'legacy-single-user',
    )
  })

  it('propaga respuesta de conexión faltante y rechaza GET', async () => {
    const get = await syncHandler(
      new Request('http://localhost/api/spotify/sync'),
      mockContext(),
    )
    expect(get.status).toBe(405)

    spotifyMocks.requireSpotifyConnection.mockResolvedValue({
      ok: false,
      response: Response.json(
        { error: { code: 'SPOTIFY_NOT_CONNECTED' } },
        { status: 400 },
      ),
    })
    const post = await syncHandler(
      new Request('http://localhost/api/spotify/sync', { method: 'POST' }),
      mockContext(),
    )
    expect(post.status).toBe(400)
  })
})
