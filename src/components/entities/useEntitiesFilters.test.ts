import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEntitiesFilters } from './useEntitiesFilters'
import type { Entity } from '../../types'

/**
 * G5: tests para el hook que extrajimos en G2.
 *
 * Espejo más simple del de Quotes: solo `typeFilter`, sin favoritesOnly.
 * Cubre que el filtro se aplica, que availableTypes se ordena por count
 * desc, y que sin filtro pasan todas las entidades.
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

describe('useEntitiesFilters', () => {
  it('sin filtros pasa todas las entidades', () => {
    const entities = [entity('e1', 'libro'), entity('e2', 'persona')]
    const { result } = renderHook(() =>
      useEntitiesFilters({ allLoadedEntities: entities }),
    )
    expect(result.current.entities).toHaveLength(2)
    expect(result.current.typeFilter).toBeNull()
  })

  it('availableTypes cuenta y ordena desc', () => {
    const entities = [
      entity('e1', 'libro'),
      entity('e2', 'libro'),
      entity('e3', 'persona'),
      entity('e4', 'libro'),
    ]
    const { result } = renderHook(() =>
      useEntitiesFilters({ allLoadedEntities: entities }),
    )
    expect(result.current.availableTypes).toEqual([
      { type: 'libro', count: 3 },
      { type: 'persona', count: 1 },
    ])
  })

  it('typeFilter restringe a entidades de ese tipo', () => {
    const entities = [
      entity('e1', 'libro'),
      entity('e2', 'persona'),
      entity('e3', 'libro'),
    ]
    const { result } = renderHook(() =>
      useEntitiesFilters({ allLoadedEntities: entities }),
    )
    act(() => result.current.setTypeFilter('libro'))
    expect(result.current.entities).toHaveLength(2)
    expect(result.current.entities.map((e) => e.id).sort()).toEqual(['e1', 'e3'])
  })

  it('typeFilter null vuelve a mostrar todas', () => {
    const entities = [entity('e1', 'libro'), entity('e2', 'persona')]
    const { result } = renderHook(() =>
      useEntitiesFilters({ allLoadedEntities: entities }),
    )
    act(() => result.current.setTypeFilter('libro'))
    expect(result.current.entities).toHaveLength(1)
    act(() => result.current.setTypeFilter(null))
    expect(result.current.entities).toHaveLength(2)
  })
})
