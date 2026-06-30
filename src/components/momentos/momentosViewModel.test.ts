import { describe, expect, it } from 'vitest'
import type { Momento } from '../../types'
import {
  buildEntitiesById,
  filterMomentosByDay,
  formatDayLabel,
  readDayParamFromSearch,
  readInitialComposeFromSearch,
  shouldUseAlbumView,
} from './momentosViewModel'

function momento(id: string, capturedAt: string): Momento {
  return {
    id,
    kind: 'nota',
    capturedAt,
    payload: { bodyText: id },
    origin: { kind: 'manual' },
    entityIds: [],
    createdAt: capturedAt,
    updatedAt: capturedAt,
  }
}

describe('momentosViewModel', () => {
  it('lee compose inicial solo para kinds permitidos', () => {
    expect(readInitialComposeFromSearch('?compose=foto')).toBe('foto')
    expect(readInitialComposeFromSearch('?compose=audio')).toBeUndefined()
  })

  it('lee filtro day solo en formato ISO simple', () => {
    expect(readDayParamFromSearch('?day=2026-05-31')).toBe('2026-05-31')
    expect(readDayParamFromSearch('?day=31-05-2026')).toBeNull()
  })

  it('filtra momentos por dia local y descarta fechas invalidas', () => {
    expect(
      filterMomentosByDay(
        [
          momento('same', '2026-05-31T10:00:00.000Z'),
          momento('other', '2026-06-01T10:00:00.000Z'),
          momento('bad', 'not-a-date'),
        ],
        '2026-05-31',
      ).map((item) => item.id),
    ).toEqual(['same'])
  })

  it('resuelve entidades por id y modo album', () => {
    expect(
      buildEntitiesById([
        {
          id: 'e1',
          name: 'Ana',
          type: 'persona',
          origin: { kind: 'manual' },
          createdAt: '',
          updatedAt: '',
        },
      ]).get('e1')?.name,
    ).toBe('Ana')
    expect(shouldUseAlbumView({ viewMode: 'album', filterKind: null })).toBe(true)
    expect(shouldUseAlbumView({ viewMode: 'album', filterKind: 'recorte' })).toBe(false)
  })

  it('formatea etiqueta de dia con fallback para entradas invalidas', () => {
    expect(formatDayLabel('bad')).toBe('bad')
    expect(formatDayLabel('2026-05-31')).toMatch(/2026/)
  })
})
