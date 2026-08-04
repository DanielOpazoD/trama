import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDateHeading,
  formatMonthLabel,
  formatTime,
  getMomentoPhotoItems,
  momentoItemThumbKey,
  groupByDay,
  groupByMonth,
  momentoMediaUrl,
} from './helpers'
import type { Momento } from '../../types'

/**
 * Tests puros — sin DOM, sin queries. Cubren los helpers del módulo
 * Momentos. readImageDimensions no se testea acá porque depende de DOM.
 */

function makeMomento(partial: Partial<Momento> = {}): Momento {
  return {
    id: 'm-1',
    kind: 'nota',
    capturedAt: '2026-05-24T12:00:00.000Z',
    payload: {},
    note: undefined,
    origin: { kind: 'manual' },
    entityIds: [],
    createdAt: '2026-05-24T12:00:00.000Z',
    updatedAt: '2026-05-24T12:00:00.000Z',
    ...partial,
  }
}

describe('formatDateHeading', () => {
  // Usamos horas del MEDIODÍA local (12:00) sin Z para que ningún
  // timezone offset cruce el día — el test pasa en cualquier región.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 24, 12, 0, 0)) // local: 24 mayo 12:00
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve "hoy" para una fecha del mismo día calendario', () => {
    // Construimos como Date local y serializamos a ISO — sigue siendo
    // el mismo día calendario en local time.
    const todayMorning = new Date(2026, 4, 24, 9, 0, 0).toISOString()
    const todayEvening = new Date(2026, 4, 24, 20, 0, 0).toISOString()
    expect(formatDateHeading(todayMorning)).toBe('hoy')
    expect(formatDateHeading(todayEvening)).toBe('hoy')
  })

  it('devuelve "ayer" para el día anterior', () => {
    const yesterday = new Date(2026, 4, 23, 18, 0, 0).toISOString()
    expect(formatDateHeading(yesterday)).toBe('ayer')
  })

  it('devuelve label completo para fechas más viejas (mismo año)', () => {
    const older = new Date(2026, 4, 15, 12, 0, 0).toISOString()
    const label = formatDateHeading(older)
    expect(label).toContain('15')
    expect(label).toContain('mayo')
    expect(label).not.toContain('2026') // mismo año, no muestra año
  })

  it('incluye el año cuando la fecha es de otro año', () => {
    const older = new Date(2024, 11, 10, 12, 0, 0).toISOString()
    expect(formatDateHeading(older)).toContain('2024')
  })

  it('devuelve string vacía para fechas inválidas', () => {
    expect(formatDateHeading('no-es-una-fecha')).toBe('')
    expect(formatDateHeading('')).toBe('')
  })
})

describe('formatTime', () => {
  it('devuelve HH:MM en 24h locale es', () => {
    // 12:00 UTC es 09:00 en es-AR pero el test no asume zona — solo
    // que sale en formato HH:MM y no string vacía.
    const t = formatTime('2026-05-24T12:00:00.000Z')
    expect(t).toMatch(/^\d{2}:\d{2}$/)
  })

  it('string vacía si la fecha es inválida', () => {
    expect(formatTime('garbage')).toBe('')
  })
})

describe('groupByDay', () => {
  it('agrupa items del mismo día calendario juntos', () => {
    // Usamos horas de mediodía local para evitar cruzar día por timezone.
    const items = [
      makeMomento({
        id: 'a',
        capturedAt: new Date(2026, 4, 24, 18, 0, 0).toISOString(),
      }),
      makeMomento({
        id: 'b',
        capturedAt: new Date(2026, 4, 24, 9, 0, 0).toISOString(),
      }),
      makeMomento({
        id: 'c',
        capturedAt: new Date(2026, 4, 23, 15, 0, 0).toISOString(),
      }),
    ]
    const result = groupByDay(items)
    expect(result).toHaveLength(2)
    expect(result[0]!.entries).toHaveLength(2) // a, b mismo día
    expect(result[0]!.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(result[1]!.entries).toHaveLength(1)
    expect(result[1]!.entries[0]!.id).toBe('c')
  })

  it('respeta el orden de entrada (asume desc por captured_at)', () => {
    const items = [
      makeMomento({
        id: 'newest',
        capturedAt: new Date(2026, 4, 24, 12, 0, 0).toISOString(),
      }),
      makeMomento({
        id: 'oldest',
        capturedAt: new Date(2026, 4, 1, 12, 0, 0).toISOString(),
      }),
    ]
    const result = groupByDay(items)
    expect(result[0]!.entries[0]!.id).toBe('newest')
    expect(result[1]!.entries[0]!.id).toBe('oldest')
  })

  it('descarta items con capturedAt inválido', () => {
    const items = [
      makeMomento({ id: 'ok', capturedAt: '2026-05-24T12:00:00.000Z' }),
      makeMomento({ id: 'bad', capturedAt: 'not-a-date' }),
    ]
    const result = groupByDay(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.entries[0]!.id).toBe('ok')
  })

  it('lista vacía → array vacío', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('groupByMonth', () => {
  it('agrupa items del mismo mes calendario juntos', () => {
    const items = [
      makeMomento({ id: 'a', capturedAt: '2026-05-30T12:00:00.000Z' }),
      makeMomento({ id: 'b', capturedAt: '2026-05-01T12:00:00.000Z' }),
      makeMomento({ id: 'c', capturedAt: '2026-04-15T12:00:00.000Z' }),
    ]
    const result = groupByMonth(items)
    expect(result).toHaveLength(2)
    expect(result[0]!.monthKey).toBe('2026-05')
    expect(result[0]!.entries).toHaveLength(2)
    expect(result[1]!.monthKey).toBe('2026-04')
  })

  it('monthKey usa zero-padding en el mes', () => {
    const items = [makeMomento({ capturedAt: '2026-03-10T12:00:00.000Z' })]
    expect(groupByMonth(items)[0]!.monthKey).toBe('2026-03')
  })

  it('descarta items con capturedAt inválido', () => {
    const items = [
      makeMomento({ id: 'bad', capturedAt: 'xxx' }),
      makeMomento({ id: 'ok', capturedAt: '2026-05-24T12:00:00.000Z' }),
    ]
    const result = groupByMonth(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.entries[0]!.id).toBe('ok')
  })
})

describe('formatMonthLabel', () => {
  it('devuelve "mes año" en español para un monthKey válido', () => {
    const label = formatMonthLabel('2026-05')
    expect(label).toContain('mayo')
    expect(label).toContain('2026')
  })

  it('devuelve el monthKey crudo si no parsea', () => {
    expect(formatMonthLabel('bad-key')).toBe('bad-key')
    expect(formatMonthLabel('')).toBe('')
  })
})

describe('momentoMediaUrl', () => {
  it('codifica cada segmento de la storageKey sin esconder el namespace', () => {
    expect(momentoMediaUrl('legacy-single-user/foto reciente.jpg')).toBe(
      '/api/momentos-file/legacy-single-user/foto%20reciente.jpg',
    )
  })

  it('mantiene compatibilidad con keys legacy sin namespace', () => {
    expect(momentoMediaUrl('foto vieja.jpg')).toBe('/api/momentos-file/foto%20vieja.jpg')
  })
})

describe('getMomentoPhotoItems', () => {
  it('arrastra type y posterStorageKey al normalizar items', () => {
    // Si la normalización "olvida" el póster, todo render vuelve a bajar el
    // video entero para pintar la miniatura — sin ningún error visible.
    const items = getMomentoPhotoItems({
      items: [
        {
          storageKey: ' u1/r2-clip.mp4 ',
          type: 'video',
          posterStorageKey: 'u1/poster.jpg',
          width: 1920,
          height: 1080,
        },
        { storageKey: 'u1/foto.jpg' },
      ],
    })

    expect(items[0]).toMatchObject({
      storageKey: 'u1/r2-clip.mp4',
      type: 'video',
      posterStorageKey: 'u1/poster.jpg',
    })
    expect(items[1]?.posterStorageKey).toBeUndefined()
  })

  it('arrastra thumbStorageKey y momentoItemThumbKey cae al original sin él', () => {
    const items = getMomentoPhotoItems({
      items: [
        { storageKey: 'u1/foto.jpg', thumbStorageKey: 'u1/foto-thumb.jpg' },
        { storageKey: 'u1/vieja.jpg' },
      ],
    })
    expect(items[0]?.thumbStorageKey).toBe('u1/foto-thumb.jpg')
    // Las grillas montan la miniatura; sin ella, el original (fotos viejas).
    expect(momentoItemThumbKey(items[0]!)).toBe('u1/foto-thumb.jpg')
    expect(momentoItemThumbKey(items[1]!)).toBe('u1/vieja.jpg')
  })
})
