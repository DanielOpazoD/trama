import { describe, expect, it } from 'vitest'
import type { CaptureItem, Note, Recorte } from '../../api'
import {
  buildAllNoteTags,
  buildCalendarStats,
  buildNotasFeedVirtualItemMeta,
  buildNotasFeedFilter,
  buildTagCounts,
  initialSegmentFromSearch,
  isNotasFeedEverythingEmpty,
  isNotasFeedGalleryMode,
  segmentHasTags,
  selectedRecortesFromItems,
} from './notasFeedViewModel'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    content: 'Una nota sobre arquitectura',
    title: null,
    tags: [],
    pinned: false,
    promotedMomentoId: null,
    source: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
    hasImages: false,
    hasAudio: false,
    ...overrides,
  }
}

function makeRecorte(overrides: Partial<Recorte> = {}): Recorte {
  return {
    id: 'recorte-1',
    text: 'Recorte de referencia',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: null,
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: '2026-06-11T12:00:00.000Z',
    updatedAt: '2026-06-11T12:00:00.000Z',
    ...overrides,
  }
}

describe('notasFeedViewModel', () => {
  it('lee el segmento inicial desde search y cae a todo si no es válido', () => {
    expect(initialSegmentFromSearch('?segment=favoritos')).toBe('favoritos')
    expect(initialSegmentFromSearch('?segment=capturas')).toBe('capturas')
    expect(initialSegmentFromSearch('?segment=desconocido')).toBe('todo')
    expect(initialSegmentFromSearch('')).toBe('todo')
  })

  it('declara qué segmentos pueden mostrar etiquetas', () => {
    expect(segmentHasTags('todo')).toBe(true)
    expect(segmentHasTags('escritas')).toBe(true)
    expect(segmentHasTags('capturas')).toBe(false)
    expect(segmentHasTags('favoritos')).toBe(false)
  })

  it('normaliza el filtro del feed según segmento, texto, etiqueta y día', () => {
    expect(
      buildNotasFeedFilter({
        segment: 'capturas',
        search: '  imagen ',
        activeTag: 'ideas',
        selectedDay: '2026-06-10',
        capturaStatus: 'archived',
      }),
    ).toEqual({
      segment: 'capturas',
      query: 'imagen',
      tag: 'ideas',
      day: '2026-06-10',
      recorteStatus: 'archived',
    })

    expect(
      buildNotasFeedFilter({
        segment: 'todo',
        search: '   ',
        activeTag: null,
        selectedDay: null,
        capturaStatus: 'pending',
      }),
    ).toEqual({
      segment: 'todo',
      query: undefined,
      tag: undefined,
      day: null,
      recorteStatus: null,
    })
  })

  it('calcula estadísticas de calendario sin duplicar días ni etiquetas', () => {
    const { calendarDays, calendarStats } = buildCalendarStats([
      makeNote({
        id: 'n1',
        tags: ['ideas', 'personas'],
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
      makeNote({
        id: 'n2',
        tags: ['ideas'],
        createdAt: '2026-06-10T20:00:00.000Z',
      }),
      makeNote({
        id: 'n3',
        tags: ['lugares'],
        createdAt: '2026-06-11T12:00:00.000Z',
      }),
    ])

    expect(calendarDays).toEqual(['2026-06-10', '2026-06-10', '2026-06-11'])
    expect(calendarStats).toEqual([
      { n: 3, label: 'notas' },
      { n: 2, label: 'días con notas' },
      { n: 3, label: 'etiquetas' },
    ])
  })

  it('deriva conteos de tags filtrando por texto solo en segmentos con notas', () => {
    const notes = [
      makeNote({ id: 'n1', content: 'arte y memoria', tags: ['arte', 'diario'] }),
      makeNote({ id: 'n2', title: 'Artefactos', content: 'otra cosa', tags: ['arte'] }),
      makeNote({ id: 'n3', content: 'clínica', tags: ['salud'] }),
    ]

    expect(buildTagCounts(notes, { segment: 'todo', search: 'arte' })).toEqual([
      ['arte', 2],
      ['diario', 1],
    ])
    expect(buildTagCounts(notes, { segment: 'capturas', search: 'arte' })).toEqual([])
  })

  it('mantiene el universo de tags ordenado para autocompletar', () => {
    expect(
      buildAllNoteTags([
        makeNote({ tags: ['zeta', 'arte'] }),
        makeNote({ tags: ['arte', 'bio'] }),
      ]),
    ).toEqual(['arte', 'bio', 'zeta'])
  })

  it('distingue galería y empty-state real sin confundir filtros activos', () => {
    expect(isNotasFeedGalleryMode({ feedView: 'galeria', segment: 'todo' })).toBe(true)
    expect(isNotasFeedGalleryMode({ feedView: 'galeria', segment: 'favoritos' })).toBe(
      false,
    )
    expect(isNotasFeedGalleryMode({ feedView: 'list', segment: 'capturas' })).toBe(false)

    expect(
      isNotasFeedEverythingEmpty({
        isLoading: false,
        hasContentFilter: false,
        itemCount: 0,
        hasNextPage: false,
        segment: 'capturas',
        capturaStatus: 'pending',
      }),
    ).toBe(false)
    expect(
      isNotasFeedEverythingEmpty({
        isLoading: false,
        hasContentFilter: true,
        itemCount: 0,
        hasNextPage: false,
        segment: 'todo',
        capturaStatus: 'all',
      }),
    ).toBe(false)
    expect(
      isNotasFeedEverythingEmpty({
        isLoading: false,
        hasContentFilter: false,
        itemCount: 0,
        hasNextPage: false,
        segment: 'todo',
        capturaStatus: 'all',
      }),
    ).toBe(true)
  })

  it('resuelve recortes seleccionados desde el feed mixto', () => {
    const recorte = makeRecorte({ id: 'r1' })
    const items: CaptureItem[] = [
      { type: 'note', id: 'n1', createdAt: '2026-06-10T12:00:00.000Z', note: makeNote() },
      { type: 'recorte', id: 'r1', createdAt: recorte.createdAt, recorte },
      {
        type: 'recorte',
        id: 'r2',
        createdAt: '2026-06-12T12:00:00.000Z',
        recorte: makeRecorte({ id: 'r2' }),
      },
    ]

    expect(selectedRecortesFromItems(items, new Set(['n1', 'r1']))).toEqual([recorte])
  })

  it('deriva keys y delay visual para filas virtuales sin tocar React', () => {
    expect(
      buildNotasFeedVirtualItemMeta({
        item: {
          type: 'note',
          id: 'n1',
          createdAt: '2026-06-10T12:00:00.000Z',
          note: makeNote({ id: 'n1' }),
        },
        index: 2,
        reducedMotion: false,
      }),
    ).toEqual({ key: 'note-n1', delay: '90ms' })
    expect(
      buildNotasFeedVirtualItemMeta({
        item: {
          type: 'recorte',
          id: 'r1',
          createdAt: '2026-06-11T12:00:00.000Z',
          recorte: makeRecorte({ id: 'r1' }),
        },
        index: 8,
        reducedMotion: false,
      }),
    ).toEqual({ key: 'recorte-r1', delay: undefined })
  })
})
