import { describe, it, expect } from 'vitest'
import { buildNotasFeed, type NotasFeedFilter } from './useNotasFeed'
import type { Note, Recorte } from '../api'

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    content: 'contenido de la nota',
    title: null,
    tags: [],
    pinned: false,
    promotedMomentoId: null,
    source: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
    hasImages: false,
    ...over,
  }
}

function makeRecorte(over: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r1',
    text: 'texto del recorte',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    captureMode: null,
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:00:00.000Z',
    ...over,
  }
}

const ALL: NotasFeedFilter = { segment: 'todo' }

describe('buildNotasFeed', () => {
  it('mezcla notas y recortes y ordena por createdAt descendente', () => {
    const notes = [
      makeNote({ id: 'old', createdAt: '2026-06-01T00:00:00.000Z' }),
      makeNote({ id: 'new', createdAt: '2026-06-12T00:00:00.000Z' }),
    ]
    const recortes = [makeRecorte({ id: 'mid', createdAt: '2026-06-08T00:00:00.000Z' })]

    const items = buildNotasFeed(notes, recortes, ALL)

    expect(items.map((i) => i.id)).toEqual(['new', 'mid', 'old'])
    expect(items[0]!.type).toBe('note')
    expect(items[1]!.type).toBe('recorte')
  })

  it('ante el mismo createdAt, ordena la nota antes que el recorte (desempate determinista)', () => {
    const ts = '2026-06-12T00:00:00.000Z'
    const items = buildNotasFeed(
      [makeNote({ id: 'n-same', createdAt: ts })],
      [makeRecorte({ id: 'r-same', createdAt: ts })],
      ALL,
    )
    expect(items.map((i) => `${i.type}:${i.id}`)).toEqual([
      'note:n-same',
      'recorte:r-same',
    ])
  })

  it("segmento 'escritas' deja solo notas", () => {
    const items = buildNotasFeed([makeNote()], [makeRecorte()], { segment: 'escritas' })
    expect(items).toHaveLength(1)
    expect(items[0]!.type).toBe('note')
  })

  it("segmento 'capturas' deja solo recortes", () => {
    const items = buildNotasFeed([makeNote()], [makeRecorte()], { segment: 'capturas' })
    expect(items).toHaveLength(1)
    expect(items[0]!.type).toBe('recorte')
  })

  it('filtra por texto en notas (contenido + título) y recortes (texto + fuente)', () => {
    const notes = [
      makeNote({ id: 'n-hit', content: 'hablo de manzanas aquí' }),
      makeNote({ id: 'n-title', content: 'cualquier cosa', title: 'Manzanas' }),
      makeNote({ id: 'n-miss', content: 'peras y uvas' }),
    ]
    const recortes = [
      makeRecorte({ id: 'r-hit', text: 'cita sobre MANZANAS' }),
      makeRecorte({ id: 'r-author', text: 'x', sourceAuthor: 'Sr. Manzana' }),
      makeRecorte({ id: 'r-miss', text: 'nada relevante' }),
    ]

    const items = buildNotasFeed(notes, recortes, { segment: 'todo', query: 'manzana' })

    expect(items.map((i) => i.id).sort()).toEqual(
      ['n-hit', 'n-title', 'r-author', 'r-hit'].sort(),
    )
  })

  it('filtra por etiqueta sobre los tags de la nota', () => {
    const notes = [
      makeNote({ id: 'tagged', tags: ['ideas', 'libros'] }),
      makeNote({ id: 'untagged', tags: ['otra'] }),
    ]
    const items = buildNotasFeed(notes, [makeRecorte()], {
      segment: 'todo',
      tag: 'libros',
    })
    // Solo la nota con el tag; el recorte sin tags queda fuera del filtro.
    expect(items.map((i) => i.id)).toEqual(['tagged'])
  })

  it('filtra por día (localDayKey): deja los ítems de ese día, excluye los demás', () => {
    // Mediodía UTC evita que el desfase de zona corra la fecha local.
    const notes = [
      makeNote({ id: 'n-mismo-dia', createdAt: '2026-06-10T12:00:00.000Z' }),
      makeNote({ id: 'n-otro-dia', createdAt: '2026-06-11T12:00:00.000Z' }),
    ]
    const recortes = [
      makeRecorte({ id: 'r-mismo-dia', createdAt: '2026-06-10T12:00:00.000Z' }),
      makeRecorte({ id: 'r-otro-dia', createdAt: '2026-06-09T12:00:00.000Z' }),
    ]

    const items = buildNotasFeed(notes, recortes, { segment: 'todo', day: '2026-06-10' })

    // El filtro aplica a notas y recortes por igual (feed mixto coherente).
    expect(items.map((i) => i.id).sort()).toEqual(['n-mismo-dia', 'r-mismo-dia'].sort())
  })

  it('day = null no filtra por día', () => {
    const notes = [
      makeNote({ id: 'a', createdAt: '2026-06-10T12:00:00.000Z' }),
      makeNote({ id: 'b', createdAt: '2026-06-11T12:00:00.000Z' }),
    ]
    const items = buildNotasFeed(notes, [], { segment: 'todo', day: null })
    expect(items.map((i) => i.id).sort()).toEqual(['a', 'b'])
  })

  it('devuelve vacío cuando no hay datos', () => {
    expect(buildNotasFeed([], [], ALL)).toEqual([])
  })
})
