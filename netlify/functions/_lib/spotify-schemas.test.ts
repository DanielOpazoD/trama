import { describe, expect, it } from 'vitest'
import {
  SpotifyPlaylistResponse,
  SpotifyPlaylistTracksPage,
  SpotifyProfileResponse,
  SpotifyRecentlyPlayedResponse,
  SpotifySavedTracksResponse,
  SpotifyTokenResponse,
  SpotifyTopArtistsResponse,
  SpotifyTopTracksResponse,
} from './spotify/schemas'

/**
 * E5 — Validación Zod de las respuestas de Spotify. Cada parser tiene dos
 * caminos: happy path (la shape real del proveedor pasa) y shape rota (un
 * cambio de contrato falla RUIDOSO con ZodError en vez de propagar undefined).
 */

describe('SpotifyTokenResponse', () => {
  it('acepta el token con refresh_token presente o ausente', () => {
    const withRefresh = {
      access_token: 'at',
      refresh_token: 'rt',
      token_type: 'Bearer',
      scope: 'user-read-recently-played',
      expires_in: 3600,
    }
    expect(SpotifyTokenResponse.parse(withRefresh)).toMatchObject({ access_token: 'at' })

    // En un refresh, Spotify suele NO reenviar refresh_token.
    const { refresh_token: _omit, ...withoutRefresh } = withRefresh
    expect(SpotifyTokenResponse.parse(withoutRefresh).refresh_token).toBeUndefined()
  })

  it('ignora campos extra del proveedor (passthrough)', () => {
    const parsed = SpotifyTokenResponse.parse({
      access_token: 'at',
      token_type: 'Bearer',
      scope: 's',
      expires_in: 3600,
      something_new: true,
    })
    expect(parsed.access_token).toBe('at')
  })

  it('falla ruidoso si falta access_token o cambia el tipo de expires_in', () => {
    expect(() =>
      SpotifyTokenResponse.parse({ token_type: 'Bearer', scope: 's', expires_in: 3600 }),
    ).toThrow()
    expect(() =>
      SpotifyTokenResponse.parse({
        access_token: 'at',
        token_type: 'Bearer',
        scope: 's',
        expires_in: '3600', // string en vez de number
      }),
    ).toThrow()
  })

  it('exige expires_in entero positivo', () => {
    const base = { access_token: 'at', token_type: 'Bearer', scope: 's' }
    expect(() => SpotifyTokenResponse.parse({ ...base, expires_in: 0 })).toThrow()
    expect(() => SpotifyTokenResponse.parse({ ...base, expires_in: -1 })).toThrow()
    expect(() => SpotifyTokenResponse.parse({ ...base, expires_in: 2.5 })).toThrow()
    expect(SpotifyTokenResponse.parse({ ...base, expires_in: 3600 }).expires_in).toBe(
      3600,
    )
  })
})

describe('SpotifyProfileResponse', () => {
  it('acepta id + display_name (incluido null)', () => {
    expect(SpotifyProfileResponse.parse({ id: 'u1', display_name: null })).toEqual({
      id: 'u1',
      display_name: null,
    })
  })

  it('falla ruidoso si falta id (contrato roto de /me)', () => {
    expect(() => SpotifyProfileResponse.parse({ display_name: 'Daniel' })).toThrow()
  })
})

describe('SpotifyRecentlyPlayedResponse', () => {
  const validItem = {
    played_at: '2026-05-01T10:00:00Z',
    track: {
      id: 't1',
      name: 'Canción',
      duration_ms: 1000,
      artists: [{ id: 'a1', name: 'Artista' }],
      album: { id: 'al1', name: 'Album' },
    },
  }

  it('acepta items con track completo', () => {
    const parsed = SpotifyRecentlyPlayedResponse.parse({ items: [validItem] })
    expect(parsed.items).toHaveLength(1)
  })

  it('falla ruidoso si un item no trae track (shape rota)', () => {
    expect(() =>
      SpotifyRecentlyPlayedResponse.parse({
        items: [{ played_at: '2026-05-01T10:00:00Z' }],
      }),
    ).toThrow()
  })
})

describe('SpotifySavedTracksResponse', () => {
  it('acepta total presente o ausente', () => {
    expect(SpotifySavedTracksResponse.parse({ total: 42 }).total).toBe(42)
    expect(SpotifySavedTracksResponse.parse({}).total).toBeUndefined()
  })

  it('falla ruidoso si total no es number', () => {
    expect(() => SpotifySavedTracksResponse.parse({ total: 'muchos' })).toThrow()
  })
})

describe('SpotifyTopArtistsResponse / SpotifyTopTracksResponse', () => {
  it('acepta items de artistas con géneros', () => {
    const parsed = SpotifyTopArtistsResponse.parse({
      items: [{ id: 'a1', name: 'X', genres: ['rock'], popularity: 50 }],
    })
    expect(parsed.items?.[0]?.genres).toEqual(['rock'])
  })

  it('artista sin genres array → falla ruidoso', () => {
    expect(() =>
      SpotifyTopArtistsResponse.parse({
        items: [{ id: 'a1', name: 'X', popularity: 50 }],
      }),
    ).toThrow()
  })

  it('acepta tracks con release_date opcional', () => {
    const parsed = SpotifyTopTracksResponse.parse({
      items: [
        {
          id: 't1',
          name: 'X',
          artists: [{ name: 'Artista' }],
          album: {},
          popularity: 50,
        },
      ],
    })
    expect(parsed.items?.[0]?.album.release_date).toBeUndefined()
  })
})

describe('SpotifyPlaylistResponse / SpotifyPlaylistTracksPage', () => {
  const track = {
    id: 't1',
    name: 'Canción',
    duration_ms: 1000,
    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
    artists: [{ id: 'a1', name: 'Artista', external_urls: {} }],
    album: { id: 'al1', name: 'Album', release_date: '1999', external_urls: {} },
  }

  it('acepta la respuesta inicial con metadata + tracks', () => {
    const parsed = SpotifyPlaylistResponse.parse({
      name: 'Mi playlist',
      description: null,
      owner: { id: 'owner-1' },
      tracks: { total: 1, next: null, items: [{ added_at: null, track }] },
    })
    expect(parsed.tracks.items[0]?.track?.id).toBe('t1')
  })

  it('acepta track null en un item (tracks borrados/locales)', () => {
    const parsed = SpotifyPlaylistResponse.parse({
      name: 'P',
      description: null,
      owner: { id: 'o' },
      tracks: { total: 1, next: null, items: [{ added_at: null, track: null }] },
    })
    expect(parsed.tracks.items[0]?.track).toBeNull()
  })

  it('acepta owner.display_name null (la Spotify Web API lo permite)', () => {
    const parsed = SpotifyPlaylistResponse.parse({
      name: 'P',
      description: null,
      owner: { id: 'o', display_name: null },
      tracks: { total: 0, next: null, items: [] },
    })
    expect(parsed.owner.display_name).toBeNull()
  })

  it('falla ruidoso si falta tracks.total (contrato roto)', () => {
    expect(() =>
      SpotifyPlaylistResponse.parse({
        name: 'P',
        description: null,
        owner: { id: 'o' },
        tracks: { next: null, items: [] },
      }),
    ).toThrow()
  })

  it('valida la página subsiguiente de tracks', () => {
    expect(
      SpotifyPlaylistTracksPage.parse({ items: [{ added_at: null, track }], next: null })
        .items,
    ).toHaveLength(1)
    expect(() => SpotifyPlaylistTracksPage.parse({ items: [] })).toThrow() // falta next
  })
})
