import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  isAnniversary,
  describeYears,
  useHiloOfTheDay,
  readHiloOfTheDay,
} from './useHiloOfTheDay'
import type { Entity, Quote } from '../types'

/**
 * δ7: hilo-of-the-day. Las funciones puras (isAnniversary/describeYears) se
 * testean con un `today` explícito; el hook y readHiloOfTheDay dependen de
 * `new Date()` + localStorage, así que se fija el reloj y se limpia el storage.
 */

describe('describeYears', () => {
  it('usa fraseo natural para 1-3 y numérico para el resto', () => {
    expect(describeYears(1)).toBe('hace exactamente un año')
    expect(describeYears(2)).toBe('hace dos años')
    expect(describeYears(3)).toBe('hace tres años')
    expect(describeYears(7)).toBe('hace 7 años')
  })
})

describe('isAnniversary', () => {
  const today = new Date('2024-05-23T12:00:00Z')

  it('detecta mismo mes/día al menos un año atrás', () => {
    expect(isAnniversary('2023-05-23T08:00:00Z', today)).toEqual({ yearsAgo: 1 })
    expect(isAnniversary('2020-05-23T08:00:00Z', today)).toEqual({ yearsAgo: 4 })
  })

  it('NO es aniversario si fue creado hoy (mismo año)', () => {
    expect(isAnniversary('2024-05-23T01:00:00Z', today)).toBeNull()
  })

  it('NO es aniversario en otra fecha', () => {
    expect(isAnniversary('2023-05-22T08:00:00Z', today)).toBeNull()
    expect(isAnniversary('2023-06-23T08:00:00Z', today)).toBeNull()
  })

  it('devuelve null ante una fecha inválida', () => {
    expect(isAnniversary('no-es-fecha', today)).toBeNull()
  })
})

describe('useHiloOfTheDay + readHiloOfTheDay', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-05-23T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  const entity = (over: Partial<Entity> = {}): Entity => ({
    id: 'e1',
    type: 'escritor',
    name: 'Borges',
    createdAt: '2020-01-01T00:00:00Z',
    updatedAt: '2020-01-01T00:00:00Z',
    origin: { kind: 'manual' },
    ...over,
  })
  const quote = (over: Partial<Quote> = {}): Quote => ({
    id: 'q1',
    entityId: 'e1',
    text: 'una cita',
    linkedQuoteIds: [],
    // Mediodía local SIN `Z`: evita que el offset de zona horaria corra el día
    // (con `Z` y TZ negativa, medianoche UTC cae el día anterior en local).
    createdAt: '2023-05-23T12:00:00', // aniversario de hoy (1 año)
    updatedAt: '2023-05-23T12:00:00',
    origin: { kind: 'manual' },
    ...over,
  })

  it('cachea el hilo de un aniversario de cita y lo lee readHiloOfTheDay', () => {
    renderHook(() => useHiloOfTheDay([entity()], [quote()]))
    expect(readHiloOfTheDay()).toBe(
      'hace exactamente un año guardaste una cita de Borges',
    )
  })

  it('limpia el texto cuando hoy no hay aniversario', () => {
    window.localStorage.setItem('trama:hilo-text', 'texto viejo')
    renderHook(() => useHiloOfTheDay([entity({ createdAt: '2021-02-02T00:00:00Z' })], []))
    expect(readHiloOfTheDay()).toBeNull()
  })

  it('readHiloOfTheDay devuelve null si la cache es de otro día', () => {
    window.localStorage.setItem('trama:hilo-date', '2020-01-01')
    window.localStorage.setItem('trama:hilo-text', 'de otro día')
    expect(readHiloOfTheDay()).toBeNull()
  })

  it('no recomputa si ya se calculó hoy (respeta la fecha cacheada)', () => {
    window.localStorage.setItem('trama:hilo-date', '2024-05-23')
    window.localStorage.setItem('trama:hilo-text', 'ya estaba')
    renderHook(() => useHiloOfTheDay([entity()], [quote()]))
    // No se sobreescribe porque la fecha ya es la de hoy.
    expect(readHiloOfTheDay()).toBe('ya estaba')
  })
})
