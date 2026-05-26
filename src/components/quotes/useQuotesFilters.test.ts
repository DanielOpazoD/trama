import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuotesFilters } from './useQuotesFilters'
import type { Entity, Quote } from '../../types'

/**
 * G5: tests para el hook que extrajimos en FF3.
 *
 * Cubre el comportamiento de filtrado (typeFilter, favoritesOnly, AND
 * acumulativo) y las derivaciones memoizadas (availableTypes, pinnedCount).
 * Sin tests RTL acá — el componente que consume el hook
 * (QuotesFiltersBar) se testea contra el comportamiento visual aparte.
 */

const NOW = '2026-05-25T12:00:00Z'

function entity(id: string, type: string, name = id): Entity {
  return {
    id,
    name,
    type,
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as Entity
}

function quote(id: string, entityId: string, opts: Partial<Quote> = {}): Quote {
  return {
    id,
    entityId,
    text: `quote-${id}`,
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: NOW,
    updatedAt: NOW,
    ...opts,
  } as Quote
}

const ENTITIES: Entity[] = [
  entity('e-libro-1', 'libro'),
  entity('e-libro-2', 'libro'),
  entity('e-persona-1', 'persona'),
]

describe('useQuotesFilters', () => {
  it('sin filtros activos devuelve todas las quotes', () => {
    const quotes = [
      quote('q1', 'e-libro-1'),
      quote('q2', 'e-persona-1'),
    ]
    const { result } = renderHook(() =>
      useQuotesFilters({ allLoadedQuotes: quotes, entities: ENTITIES }),
    )
    expect(result.current.quotes).toHaveLength(2)
    expect(result.current.typeFilter).toBeNull()
    expect(result.current.favoritesOnly).toBe(false)
  })

  it('availableTypes cuenta y ordena por count desc', () => {
    const quotes = [
      quote('q1', 'e-libro-1'),
      quote('q2', 'e-libro-2'),
      quote('q3', 'e-libro-1'),
      quote('q4', 'e-persona-1'),
    ]
    const { result } = renderHook(() =>
      useQuotesFilters({ allLoadedQuotes: quotes, entities: ENTITIES }),
    )
    expect(result.current.availableTypes).toEqual([
      { type: 'libro', count: 3 },
      { type: 'persona', count: 1 },
    ])
  })

  it('typeFilter restringe a quotes de entidades de ese tipo', () => {
    const quotes = [
      quote('q1', 'e-libro-1'),
      quote('q2', 'e-persona-1'),
      quote('q3', 'e-libro-2'),
    ]
    const { result } = renderHook(() =>
      useQuotesFilters({ allLoadedQuotes: quotes, entities: ENTITIES }),
    )
    act(() => result.current.setTypeFilter('libro'))
    expect(result.current.quotes).toHaveLength(2)
    expect(result.current.quotes.map((q) => q.id).sort()).toEqual(['q1', 'q3'])
  })

  it('favoritesOnly restringe a quotes con pinnedAt', () => {
    const quotes = [
      quote('q1', 'e-libro-1', { pinnedAt: NOW }),
      quote('q2', 'e-libro-2'),
      quote('q3', 'e-persona-1', { pinnedAt: NOW }),
    ]
    const { result } = renderHook(() =>
      useQuotesFilters({ allLoadedQuotes: quotes, entities: ENTITIES }),
    )
    expect(result.current.pinnedCount).toBe(2)
    act(() => result.current.setFavoritesOnly(true))
    expect(result.current.quotes).toHaveLength(2)
    expect(result.current.quotes.map((q) => q.id).sort()).toEqual(['q1', 'q3'])
  })

  it('typeFilter + favoritesOnly se acumulan (AND)', () => {
    const quotes = [
      quote('q1', 'e-libro-1', { pinnedAt: NOW }),  // libro + favorita
      quote('q2', 'e-libro-2'),                       // libro, no favorita
      quote('q3', 'e-persona-1', { pinnedAt: NOW }),  // persona + favorita
    ]
    const { result } = renderHook(() =>
      useQuotesFilters({ allLoadedQuotes: quotes, entities: ENTITIES }),
    )
    act(() => {
      result.current.setTypeFilter('libro')
      result.current.setFavoritesOnly(true)
    })
    expect(result.current.quotes).toHaveLength(1)
    expect(result.current.quotes[0]?.id).toBe('q1')
  })

  it('pinnedCount es count absoluto, no se ve afectado por typeFilter', () => {
    const quotes = [
      quote('q1', 'e-libro-1', { pinnedAt: NOW }),
      quote('q2', 'e-persona-1', { pinnedAt: NOW }),
    ]
    const { result } = renderHook(() =>
      useQuotesFilters({ allLoadedQuotes: quotes, entities: ENTITIES }),
    )
    expect(result.current.pinnedCount).toBe(2)
    act(() => result.current.setTypeFilter('libro'))
    // El chip de favoritas sigue mostrando el total absoluto — la UX
    // espera ver "Si saco el filtro tengo N favoritas en total".
    expect(result.current.pinnedCount).toBe(2)
  })
})
