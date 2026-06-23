import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

import { spotifyApi } from './spotify'
import { xApi } from './x'

beforeEach(() => {
  requestMock.mockReset()
})

describe('spotifyApi client contract', () => {
  it('lee status y arranca login vía request<T> autenticado', async () => {
    requestMock
      .mockResolvedValueOnce({
        connected: true,
        spotifyUserId: 'sp-user',
        displayName: 'Daniel',
        connectedAt: '2026-06-20T10:00:00.000Z',
        lastSyncedAt: null,
        counts: {
          totalPlays: 10,
          uniqueTracks: 8,
          mostRecentPlay: null,
        },
      })
      .mockResolvedValueOnce({ url: 'https://accounts.spotify.com/authorize' })

    await expect(spotifyApi.spotifyStatus()).resolves.toMatchObject({
      connected: true,
      displayName: 'Daniel',
    })
    await expect(spotifyApi.spotifyLogin()).resolves.toEqual({
      url: 'https://accounts.spotify.com/authorize',
    })

    expect(requestMock.mock.calls).toEqual([
      ['/api/spotify/status'],
      ['/api/spotify/login'],
    ])
  })

  it('codifica plays/timing con URLSearchParams y mantiene defaults explícitos', async () => {
    requestMock
      .mockResolvedValueOnce({
        group: 'album',
        since: '2026-01-01T00:00:00.000Z',
        items: [],
        summary: {
          totalPlays: 0,
          uniqueTracks: 0,
          uniqueArtists: 0,
          uniqueAlbums: 0,
          totalMinutes: 0,
        },
      })
      .mockResolvedValueOnce({
        since: '2026-01-01T00:00:00.000Z',
        playedAts: [],
        truncated: false,
      })

    await spotifyApi.spotifyPlays('album', 25, '2026-01-01T00:00:00.000Z')
    await spotifyApi.spotifyTiming('2026-01-01T00:00:00.000Z')

    expect(requestMock.mock.calls).toEqual([
      ['/api/spotify/plays?group=album&limit=25&since=2026-01-01T00%3A00%3A00.000Z'],
      ['/api/spotify/timing?since=2026-01-01T00%3A00%3A00.000Z'],
    ])
  })

  it('usa POST JSON explícito para sync, sugerencias, snapshot e import playlist', async () => {
    requestMock
      .mockResolvedValueOnce({ fetched: 1, inserted: 1, mostRecentPlay: null })
      .mockResolvedValueOnce({
        suggestions: [],
        provider: null,
        model: null,
      })
      .mockResolvedValueOnce({
        savedCount: 0,
        topGenres: [],
        topArtists: [],
        topTracks: [],
        decades: [],
        aiSummary: null,
        provider: null,
        model: null,
      })
      .mockResolvedValueOnce({
        playlist: {
          id: 'playlist-1',
          name: 'Lecturas',
          description: '',
          ownerName: 'Daniel',
          totalTracks: 1,
        },
        proposal: { entities: [], relationships: [], quotes: [] },
      })

    await spotifyApi.spotifySync()
    await spotifyApi.spotifySuggestArtists()
    await spotifyApi.spotifyLibrarySnapshot()
    await spotifyApi.importSpotifyPlaylist('https://open.spotify.com/playlist/abc')

    expect(requestMock.mock.calls).toEqual([
      ['/api/spotify/sync', { method: 'POST' }],
      ['/api/spotify/suggest-artists', { method: 'POST', body: '{}' }],
      ['/api/spotify/library-snapshot', { method: 'POST', body: '{}' }],
      [
        '/api/spotify/import-playlist',
        {
          method: 'POST',
          body: JSON.stringify({ url: 'https://open.spotify.com/playlist/abc' }),
        },
      ],
    ])
  })
})

describe('xApi client contract', () => {
  it('lee status, login y bookmarks desde rutas privadas sin fetch directo', async () => {
    requestMock
      .mockResolvedValueOnce({
        connected: true,
        username: 'daniel',
        xUserId: 'x-1',
        lastSyncedAt: null,
        counts: { totalBookmarks: 2 },
      })
      .mockResolvedValueOnce({ url: 'https://x.com/i/oauth2/authorize' })
      .mockResolvedValueOnce({ items: [] })

    await xApi.xStatus()
    await xApi.xLogin()
    await xApi.xBookmarks()

    expect(requestMock.mock.calls).toEqual([
      ['/api/x/status'],
      ['/api/x/login'],
      ['/api/x/bookmarks'],
    ])
  })

  it('usa POST para sync/classify/crónica y DELETE codificado para bookmarks', async () => {
    requestMock
      .mockResolvedValueOnce({ fetched: 1, inserted: 1, classified: 1 })
      .mockResolvedValueOnce({ classified: 1, remaining: false })
      .mockResolvedValueOnce({ cronica: null })
      .mockResolvedValueOnce({ cronica: { id: 'c1' } })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(undefined)

    await xApi.xSync()
    await xApi.xClassify()
    await xApi.xCronica()
    await xApi.xGenerateCronica()
    await xApi.xDeleteCronica()
    await xApi.xDeleteBookmark('tweet/id con espacios')
    await xApi.xDisconnect()

    expect(requestMock.mock.calls).toEqual([
      ['/api/x/sync', { method: 'POST' }],
      ['/api/x/classify', { method: 'POST' }],
      ['/api/x/cronica'],
      ['/api/x/cronica', { method: 'POST' }],
      ['/api/x/cronica', { method: 'DELETE' }],
      ['/api/x/bookmarks?id=tweet%2Fid%20con%20espacios', { method: 'DELETE' }],
      ['/api/x/status', { method: 'DELETE' }],
    ])
  })
})
