import { describe, expect, it } from 'vitest'
import type { Momento } from '../../types'
import {
  buildEntitiesById,
  contentFilterToKind,
  filterMomentosByDay,
  formatDayLabel,
  momentoHasVideo,
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
    expect(readDayParamFromSearch('?day=2026-02-31')).toBeNull()
  })

  it('filtra momentos por dia local y descarta fechas invalidas', () => {
    expect(
      filterMomentosByDay(
        [
          momento('same', '2026-05-31T12:00:00'),
          momento('other', '2026-06-01T12:00:00'),
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

  it('traduce el filtro de contenido al kind real de la query', () => {
    expect(contentFilterToKind('all')).toBeNull()
    expect(contentFilterToKind('nota')).toBe('nota')
    expect(contentFilterToKind('recorte')).toBe('recorte')
    expect(contentFilterToKind('foto')).toBe('foto')
    // 'video' no es un kind: consulta fotos y se refina client-side.
    expect(contentFilterToKind('video')).toBe('foto')
  })

  it('detecta si un momento trae al menos un clip de video', () => {
    const conVideo: Momento = {
      ...momento('v', '2026-05-31T12:00:00'),
      kind: 'foto',
      payload: {
        items: [
          { storageKey: 'a', type: 'image' },
          { storageKey: 'b', type: 'video' },
        ],
      },
    }
    const soloFotos: Momento = {
      ...momento('f', '2026-05-31T12:00:00'),
      kind: 'foto',
      payload: { items: [{ storageKey: 'a', type: 'image' }] },
    }
    expect(momentoHasVideo(conVideo)).toBe(true)
    expect(momentoHasVideo(soloFotos)).toBe(false)
    // Momentos antiguos sin items (par legacy) no rompen: false.
    expect(momentoHasVideo(momento('n', '2026-05-31T12:00:00'))).toBe(false)
  })
})
