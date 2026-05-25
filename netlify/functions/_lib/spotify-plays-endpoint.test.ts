import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../spotify-plays'

/**
 * Tests del endpoint /api/spotify/plays con foco en lo nuevo de π3:
 *   - response.summary tiene los cinco agregados (totalPlays, uniqueTracks,
 *     uniqueArtists, uniqueAlbums, totalMinutes)
 *   - items de track/album incluyen el array `artists`
 *
 * El mockSql devuelve respuestas FIFO en el orden de las queries del
 * handler: primero la query del group seleccionado, después la del summary.
 */

describe('spotify-plays endpoint — π3 (summary + artists)', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET ?group=artist devuelve items + summary', async () => {
    // Query 1: lista de artists
    mockSqlResponses.push([
      {
        key: 'David Bowie',
        plays: 12,
        first_played: '2026-05-01T00:00:00Z',
        last_played: '2026-05-20T00:00:00Z',
        sample_spotify_id: 'abc123',
        existing_entity_id: null,
      },
    ])
    // Query 2 (core summary — sin unique_artists). ρ-fix split la
    // summary en dos para evitar el cross-join con UNNEST(artist_names)
    // que antes inflaba total_plays.
    mockSqlResponses.push([
      {
        total_plays: 50,
        unique_tracks: 30,
        unique_albums: 20,
        total_minutes: 180,
      },
    ])
    // Query 3 (artist summary — sólo unique_artists).
    mockSqlResponses.push([
      {
        unique_artists: 15,
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/spotify/plays?group=artist'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      group: string
      items: Array<{ key: string; artists?: string[] }>
      summary: Record<string, number>
    }
    expect(body.group).toBe('artist')
    expect(body.items).toHaveLength(1)
    // En group='artist', NO esperamos artists (el key YA es el artista)
    expect(body.items[0].artists).toBeUndefined()
    expect(body.summary).toEqual({
      totalPlays: 50,
      uniqueTracks: 30,
      uniqueArtists: 15,
      uniqueAlbums: 20,
      totalMinutes: 180,
    })
  })

  it('GET ?group=track devuelve items con field artists', async () => {
    mockSqlResponses.push([
      {
        key: 'Heroes',
        plays: 5,
        first_played: '2026-05-01T00:00:00Z',
        last_played: '2026-05-22T00:00:00Z',
        sample_spotify_id: 't1',
        artists: ['David Bowie'],
        existing_entity_id: null,
      },
    ])
    // Core summary (sin unique_artists).
    mockSqlResponses.push([
      {
        total_plays: 5,
        unique_tracks: 1,
        unique_albums: 1,
        total_minutes: 20,
      },
    ])
    // Artist summary.
    mockSqlResponses.push([{ unique_artists: 1 }])

    const res = await handler(
      new Request('http://localhost/api/spotify/plays?group=track'),
      mockContext(),
    )
    const body = (await res.json()) as {
      items: Array<{ key: string; artists?: string[] }>
    }
    expect(body.items[0].artists).toEqual(['David Bowie'])
  })

  it('GET ?group=album devuelve items con field artists', async () => {
    mockSqlResponses.push([
      {
        key: 'Hounds of Love',
        plays: 8,
        first_played: '2026-05-01T00:00:00Z',
        last_played: '2026-05-22T00:00:00Z',
        sample_spotify_id: 'al1',
        artists: ['Kate Bush'],
        existing_entity_id: null,
      },
    ])
    // Core summary (sin unique_artists).
    mockSqlResponses.push([
      {
        total_plays: 8,
        unique_tracks: 12,
        unique_albums: 1,
        total_minutes: 45,
      },
    ])
    // Artist summary.
    mockSqlResponses.push([{ unique_artists: 1 }])

    const res = await handler(
      new Request('http://localhost/api/spotify/plays?group=album'),
      mockContext(),
    )
    const body = (await res.json()) as {
      items: Array<{ key: string; artists?: string[] }>
    }
    expect(body.items[0].artists).toEqual(['Kate Bush'])
  })

  it('summary con ceros si el período no tiene plays', async () => {
    mockSqlResponses.push([]) // listado vacío
    // Core summary (sin unique_artists).
    mockSqlResponses.push([
      {
        total_plays: 0,
        unique_tracks: 0,
        unique_albums: 0,
        total_minutes: 0,
      },
    ])
    // Artist summary.
    mockSqlResponses.push([{ unique_artists: 0 }])

    const res = await handler(
      new Request('http://localhost/api/spotify/plays'),
      mockContext(),
    )
    const body = (await res.json()) as {
      items: unknown[]
      summary: Record<string, number>
    }
    expect(body.items).toEqual([])
    expect(body.summary.totalPlays).toBe(0)
    expect(body.summary.totalMinutes).toBe(0)
  })

  it('fallback de summary cuando la query devuelve vacío (defensa)', async () => {
    // listado normal
    mockSqlResponses.push([
      {
        key: 'X',
        plays: 1,
        first_played: '2026-05-01T00:00:00Z',
        last_played: '2026-05-22T00:00:00Z',
        sample_spotify_id: null,
        existing_entity_id: null,
      },
    ])
    // summary query devuelve [] (caso raro pero defensa)
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/spotify/plays?group=artist'),
      mockContext(),
    )
    const body = (await res.json()) as { summary: Record<string, number> }
    // Cae al objeto fallback con todos 0
    expect(body.summary).toEqual({
      totalPlays: 0,
      uniqueTracks: 0,
      uniqueArtists: 0,
      uniqueAlbums: 0,
      totalMinutes: 0,
    })
  })

  it('rechaza método no GET con 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/spotify/plays', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
