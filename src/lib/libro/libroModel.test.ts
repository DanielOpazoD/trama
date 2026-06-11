import { describe, it, expect } from 'vitest'
import { buildChapters, colophonLines, wrapLines } from './libroModel'
import type { Entity, Quote } from '../../types'

function entity(
  id: string,
  name: string,
  opts: { type?: string; year?: number } = {},
): Entity {
  return {
    id,
    type: opts.type ?? 'escritor',
    name,
    ...(opts.year ? { year: opts.year } : {}),
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Entity
}

function quote(
  id: string,
  entityId: string,
  text: string,
  opts: { source?: string; userReflection?: string; createdAt?: string } = {},
): Quote {
  return {
    id,
    entityId,
    text,
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.userReflection ? { userReflection: opts.userReflection } : {}),
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('buildChapters', () => {
  const ents = [
    entity('a', 'Borges', { year: 1899 }),
    entity('b', 'Cortázar'),
    entity('c', 'Sin citas'),
  ]
  const qs = [
    quote('q1', 'b', 'rayuela', { createdAt: '2026-02-01T00:00:00.000Z' }),
    quote('q2', 'a', 'el aleph', {
      createdAt: '2026-03-01T00:00:00.000Z',
      userReflection: 'me marcó',
    }),
    quote('q3', 'a', 'el sur', { createdAt: '2026-01-01T00:00:00.000Z' }),
  ]

  it('un capítulo por entidad con citas, la voz más presente primero', () => {
    const chapters = buildChapters(ents, qs, true)
    expect(chapters.map((c) => c.title)).toEqual(['Borges', 'Cortázar'])
    expect(chapters[0]!.subtitle).toBe('escritor · 1899')
    // Cronológico dentro del capítulo.
    expect(chapters[0]!.quotes.map((q) => q.text)).toEqual(['el sur', 'el aleph'])
    expect(chapters[0]!.quotes[1]!.marginalia).toBe('me marcó')
  })

  it('sin marginalia cuando no se pide', () => {
    const chapters = buildChapters(ents, qs, false)
    expect(chapters[0]!.quotes[1]!.marginalia).toBeNull()
  })
})

describe('colophonLines', () => {
  it('declara cuántas citas y entre qué años', () => {
    const qs = [
      quote('q1', 'a', 'x', { createdAt: '2024-05-01T12:00:00.000Z' }),
      quote('q2', 'a', 'y', { createdAt: '2026-02-01T12:00:00.000Z' }),
    ]
    const lines = colophonLines(qs, {
      author: 'Daniel',
      now: new Date('2026-06-10T12:00:00'),
    })
    expect(lines[0]).toBe('Esta edición se compuso con las 2 citas')
    expect(lines[1]).toBe('reunidas entre 2024 y 2026 por Daniel.')
    expect(lines.some((l) => /sin fines comerciales/.test(l))).toBe(true)
    expect(lines[lines.length - 1]).toBe('Trama · 2026')
  })

  it('usa "durante" cuando todo es del mismo año', () => {
    const qs = [quote('q1', 'a', 'x', { createdAt: '2026-02-01T12:00:00.000Z' })]
    expect(colophonLines(qs, { now: new Date('2026-06-10T12:00:00') })[1]).toBe(
      'reunidas durante 2026.',
    )
  })
})

describe('wrapLines', () => {
  // Medida fake: 10 unidades por carácter — determinística.
  const measure = (s: string) => s.length * 10

  it('parte en límite de palabra', () => {
    expect(wrapLines(measure, 'uno dos tres cuatro', 80)).toEqual([
      'uno dos',
      'tres',
      'cuatro',
    ])
  })

  it('respeta saltos de línea explícitos', () => {
    expect(wrapLines(measure, 'uno\n\ndos', 1000)).toEqual(['uno', 'dos'])
  })

  it('una palabra más ancha que el máximo queda en su línea', () => {
    expect(wrapLines(measure, 'superlarguísima va', 100)).toEqual([
      'superlarguísima',
      'va',
    ])
  })
})

describe('buildChapters onlyFavorites', () => {
  it('la edición breve solo lleva las citas con estrella', () => {
    const ents = [entity('a', 'Borges')]
    const qs = [
      { ...quote('q1', 'a', 'común'), pinnedAt: undefined },
      { ...quote('q2', 'a', 'favorita'), pinnedAt: '2026-01-01T00:00:00.000Z' },
    ]
    const chapters = buildChapters(ents, qs, false, true)
    expect(chapters).toHaveLength(1)
    expect(chapters[0]!.quotes.map((q) => q.text)).toEqual(['favorita'])
    expect(chapters[0]!.quotes[0]!.pinned).toBe(true)
  })
})
