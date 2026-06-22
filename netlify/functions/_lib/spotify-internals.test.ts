import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPlaylist, parsePlaylistId } from './spotify/playlist'
import {
  disconnectSpotify,
  fetchRecentlyPlayed,
  markSynced,
  storePlays,
} from './spotify/sync'
import type { SqlClient } from './spotify/client'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(text: string, status: number) {
  return new Response(text, { status })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('parsePlaylistId', () => {
  it('acepta URL, URI y bare id de Spotify', () => {
    expect(
      parsePlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc'),
    ).toBe('37i9dQZF1DXcBWIGoYBM5M')
    expect(parsePlaylistId('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(
      '37i9dQZF1DXcBWIGoYBM5M',
    )
    expect(parsePlaylistId('  37i9dQZF1DXcBWIGoYBM5M  ')).toBe('37i9dQZF1DXcBWIGoYBM5M')
  })

  it('rechaza inputs vacíos o referencias que no son playlist', () => {
    expect(parsePlaylistId('')).toBeNull()
    expect(parsePlaylistId('https://open.spotify.com/album/album-1')).toBeNull()
    expect(parsePlaylistId('spotify:track:track-1')).toBeNull()
  })
})

describe('fetchPlaylist', () => {
  it('lee playlist paginada, filtra tracks inválidos y respeta maxTracks', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://api.spotify.com/v1/playlists/playlist-1') {
        return jsonResponse({
          name: 'Nocturno',
          description: null,
          owner: { id: 'owner-1' },
          tracks: {
            total: 4,
            next: 'https://api.spotify.com/v1/playlists/playlist-1/tracks?page=2',
            items: [
              {
                added_at: '2026-05-01T10:00:00Z',
                track: {
                  id: 'track-1',
                  name: 'Canción Uno',
                  duration_ms: 180000,
                  external_urls: {},
                  artists: [
                    {
                      id: 'artist-1',
                      name: 'Artista Uno',
                      external_urls: {},
                    },
                  ],
                  album: {
                    id: 'album-1',
                    name: 'Album Uno',
                    release_date: '1999-04-03',
                    external_urls: {},
                  },
                },
              },
              { added_at: '2026-05-01T10:01:00Z', track: null },
            ],
          },
        })
      }
      if (url === 'https://api.spotify.com/v1/playlists/playlist-1/tracks?page=2') {
        return jsonResponse({
          next: null,
          items: [
            {
              added_at: null,
              track: {
                id: 'track-2',
                name: 'Canción Dos',
                duration_ms: 210000,
                external_urls: { spotify: 'https://open.spotify.com/track/custom' },
                artists: [
                  {
                    id: 'artist-2',
                    name: 'Artista Dos',
                    external_urls: { spotify: 'https://open.spotify.com/artist/custom' },
                  },
                ],
                album: {
                  id: 'album-2',
                  name: 'Album Dos',
                  release_date: 'not-a-year',
                  external_urls: { spotify: 'https://open.spotify.com/album/custom' },
                },
              },
            },
          ],
        })
      }
      throw new Error(`unexpected url ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPlaylist('token-1', 'playlist-1', 2)

    expect(result).toEqual({
      playlistName: 'Nocturno',
      playlistDescription: '',
      ownerName: 'owner-1',
      totalTracks: 4,
      tracks: [
        {
          trackId: 'track-1',
          trackName: 'Canción Uno',
          trackUrl: 'https://open.spotify.com/track/track-1',
          artists: [
            {
              id: 'artist-1',
              name: 'Artista Uno',
              url: 'https://open.spotify.com/artist/artist-1',
            },
          ],
          album: {
            id: 'album-1',
            name: 'Album Uno',
            url: 'https://open.spotify.com/album/album-1',
            year: 1999,
          },
          durationMs: 180000,
          addedAt: '2026-05-01T10:00:00Z',
        },
        {
          trackId: 'track-2',
          trackName: 'Canción Dos',
          trackUrl: 'https://open.spotify.com/track/custom',
          artists: [
            {
              id: 'artist-2',
              name: 'Artista Dos',
              url: 'https://open.spotify.com/artist/custom',
            },
          ],
          album: {
            id: 'album-2',
            name: 'Album Dos',
            url: 'https://open.spotify.com/album/custom',
            year: null,
          },
          durationMs: 210000,
          addedAt: null,
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/playlist-1',
      { headers: { Authorization: 'Bearer token-1' } },
    )
  })

  it('propaga errores de Spotify con status y texto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('forbidden', 403)),
    )

    await expect(fetchPlaylist('token-1', 'playlist-1')).rejects.toThrow(
      'Spotify playlist fetch failed (403): forbidden',
    )
  })

  it('E5: falla ruidoso si la playlist viene con shape inválida (200 OK)', async () => {
    // Faltan tracks.total → el parse Zod tira en vez de propagar undefined.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          name: 'Rota',
          description: null,
          owner: { id: 'o' },
          tracks: { next: null, items: [] },
        }),
      ),
    )
    await expect(fetchPlaylist('token-1', 'playlist-1')).rejects.toThrow()
  })
})

describe('fetchRecentlyPlayed', () => {
  it('envía limit, after y bearer token', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            played_at: '2026-05-01T10:00:00Z',
            track: {
              id: 'track-1',
              name: 'Canción Uno',
              duration_ms: 180000,
              artists: [{ id: 'artist-1', name: 'Artista Uno' }],
              album: { id: 'album-1', name: 'Album Uno' },
            },
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRecentlyPlayed('token-1', 1234)

    expect(result.items).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/me/player/recently-played?')
    expect(String(url)).toContain('limit=50')
    expect(String(url)).toContain('after=1234')
    expect(init).toEqual({ headers: { Authorization: 'Bearer token-1' } })
  })

  it('E5: falla ruidoso si un item llega sin track (shape rota del proveedor)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ items: [{ played_at: '2026-05-01T10:00:00Z' }] })),
    )
    await expect(fetchRecentlyPlayed('token-1')).rejects.toThrow()
  })
})

describe('storePlays', () => {
  it('inserta cada play con user_id y cuenta solo filas nuevas', async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'row-1' }])
      .mockResolvedValueOnce([]) as unknown as SqlClient & ReturnType<typeof vi.fn>

    const inserted = await storePlays(
      sql,
      [
        {
          played_at: '2026-05-01T10:00:00Z',
          track: {
            id: 'track-1',
            name: 'Canción Uno',
            duration_ms: 180000,
            artists: [{ id: 'artist-1', name: 'Artista Uno' }],
            album: { id: 'album-1', name: 'Album Uno' },
          },
        },
        {
          played_at: '2026-05-01T10:01:00Z',
          track: {
            id: 'track-2',
            name: 'Canción Dos',
            duration_ms: 210000,
            artists: [{ id: 'artist-2', name: 'Artista Dos' }],
            album: { id: 'album-2', name: 'Album Dos' },
          },
        },
      ],
      'user-1',
    )

    expect(inserted).toBe(1)
    expect(sql).toHaveBeenCalledTimes(2)
    expect(sql.mock.calls[0]![1]).toBe('track-1')
    expect(sql.mock.calls[0]![3]).toEqual(['artist-1'])
    expect(sql.mock.calls[0]![4]).toEqual(['Artista Uno'])
    expect(sql.mock.calls[0]![9]).toBe('user-1')
  })

  it('marca sync y desconecta usando el user_id explícito', async () => {
    const sql = vi.fn(async () => []) as unknown as SqlClient & ReturnType<typeof vi.fn>

    await markSynced(sql, 'user-1')
    await disconnectSpotify(sql, 'user-2')

    expect(sql).toHaveBeenCalledTimes(2)
    expect(sql.mock.calls[0]![1]).toBe('user-1')
    expect(sql.mock.calls[1]![1]).toBe('user-2')
  })
})
