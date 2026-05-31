import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const playlistMocks = vi.hoisted(() => ({
  parsePlaylistId: vi.fn(),
  requireSpotifyConnection: vi.fn(),
  fetchPlaylist: vi.fn(),
}))

vi.mock('./spotify/index.js', () => ({
  parsePlaylistId: playlistMocks.parsePlaylistId,
  requireSpotifyConnection: playlistMocks.requireSpotifyConnection,
  fetchPlaylist: playlistMocks.fetchPlaylist,
}))

import handler from '../spotify-import-playlist'

const playlist = {
  playlistName: 'Nocturno',
  playlistDescription: 'Selección lenta',
  ownerName: 'Daniel',
  totalTracks: 2,
  tracks: [
    {
      trackName: 'Blue in Green',
      trackUrl: 'https://open.spotify.com/track/blue',
      artists: [
        { id: 'a1', name: 'Miles Davis', url: 'https://open.spotify.com/artist/miles' },
        { id: 'a2', name: 'Bill Evans', url: 'https://open.spotify.com/artist/bill' },
      ],
      album: { name: 'Kind of Blue', year: 1959 },
    },
    {
      trackName: 'So What',
      trackUrl: 'https://open.spotify.com/track/sowhat',
      artists: [
        { id: 'a1', name: 'Miles Davis', url: 'https://open.spotify.com/artist/miles' },
      ],
      album: { name: 'Kind of Blue', year: 1959 },
    },
  ],
}

describe('spotify-import-playlist endpoint', () => {
  beforeEach(() => {
    for (const mock of Object.values(playlistMocks)) mock.mockReset()
    playlistMocks.parsePlaylistId.mockReturnValue('playlist-1')
    playlistMocks.requireSpotifyConnection.mockResolvedValue({ ok: true, token: 'token' })
    playlistMocks.fetchPlaylist.mockResolvedValue(playlist)
  })

  it('valida método, body y playlist id antes de tocar Spotify', async () => {
    const method = await handler(
      new Request('http://localhost/api/spotify/import-playlist'),
      mockContext(),
    )
    expect(method.status).toBe(405)

    const invalidBody = await handler(
      new Request('http://localhost/api/spotify/import-playlist', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      mockContext(),
    )
    expect(invalidBody.status).toBe(400)

    playlistMocks.parsePlaylistId.mockReturnValueOnce(null)
    const invalidPlaylist = await handler(
      new Request('http://localhost/api/spotify/import-playlist', {
        method: 'POST',
        body: JSON.stringify({ url: 'nota suelta' }),
      }),
      mockContext(),
    )
    expect(invalidPlaylist.status).toBe(400)
    expect(playlistMocks.requireSpotifyConnection).not.toHaveBeenCalled()
  })

  it('propaga Spotify no conectado y errores de lectura como upstream', async () => {
    playlistMocks.requireSpotifyConnection.mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: { code: 'SPOTIFY_NOT_CONNECTED' } },
        { status: 400 },
      ),
    })
    const disconnected = await handler(
      new Request('http://localhost/api/spotify/import-playlist', {
        method: 'POST',
        body: JSON.stringify({ playlistId: 'playlist-1' }),
      }),
      mockContext(),
    )
    expect(disconnected.status).toBe(400)

    playlistMocks.fetchPlaylist.mockRejectedValueOnce(new Error('forbidden'))
    const upstream = await handler(
      new Request('http://localhost/api/spotify/import-playlist', {
        method: 'POST',
        body: JSON.stringify({ playlistId: 'playlist-1' }),
      }),
      mockContext(),
    )
    expect(upstream.status).toBe(502)
    expect(await upstream.json()).toMatchObject({
      error: { code: 'UPSTREAM', message: 'No pude leer la playlist: forbidden' },
    })
  })

  it('construye propuesta compacta deduplicando artistas y limitando maxTracks', async () => {
    const res = await handler(
      new Request('http://localhost/api/spotify/import-playlist', {
        method: 'POST',
        body: JSON.stringify({
          url: 'https://open.spotify.com/playlist/playlist-1',
          maxTracks: 999,
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      playlist: {
        id: 'playlist-1',
        name: 'Nocturno',
        description: 'Selección lenta',
        ownerName: 'Daniel',
        totalTracks: 2,
      },
      proposal: {
        entities: [
          {
            type: 'musico',
            name: 'Miles Davis',
            spotifyUrl: 'https://open.spotify.com/artist/miles',
          },
          {
            type: 'musico',
            name: 'Bill Evans',
            spotifyUrl: 'https://open.spotify.com/artist/bill',
          },
          {
            type: 'cancion',
            name: 'Blue in Green',
            year: 1959,
            description: 'de Miles Davis, Bill Evans · álbum: Kind of Blue',
            spotifyUrl: 'https://open.spotify.com/track/blue',
          },
          {
            type: 'cancion',
            name: 'So What',
            year: 1959,
            description: 'de Miles Davis · álbum: Kind of Blue',
            spotifyUrl: 'https://open.spotify.com/track/sowhat',
          },
        ],
        relationships: [
          {
            fromName: 'Miles Davis',
            toName: 'Blue in Green',
            type: 'asociado_con',
            notes: 'desde playlist de Spotify',
          },
          {
            fromName: 'Miles Davis',
            toName: 'So What',
            type: 'asociado_con',
            notes: 'desde playlist de Spotify',
          },
        ],
        quotes: [],
      },
    })
    expect(playlistMocks.requireSpotifyConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'legacy-single-user',
        message: expect.stringContaining('Spotify no está conectado'),
      }),
    )
    expect(playlistMocks.fetchPlaylist).toHaveBeenCalledWith('token', 'playlist-1', 500)
  })
})
