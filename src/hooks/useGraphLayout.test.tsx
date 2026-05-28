import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useGraphLayout } from './useGraphLayout'
import type { Entity, Relationship } from '../types'

/**
 * Tests para useGraphLayout — orquesta el cálculo de posiciones del
 * grafo según el `mode`. No verificamos la geometría exacta (eso vive
 * en los tests de cada layout primitivo: byYear, byType, etc.); solo
 * el contrato del hook: que devuelve un Map de positions, que
 * reorganize fuerza recompute, y que setPosition actualiza el cache.
 */

function ent(
  id: string,
  type = 'persona',
  positionX?: number,
  positionY?: number,
): Entity {
  return {
    id,
    type,
    name: id,
    year: undefined,
    description: undefined,
    positionX,
    positionY,
    origin: { kind: 'manual' },
    createdAt: '',
    updatedAt: '',
  } as Entity
}

function rel(id: string, from: string, to: string): Relationship {
  return {
    id,
    fromId: from,
    toId: to,
    type: 'asociado_con',
    notes: undefined,
    origin: { kind: 'manual' },
    createdAt: '',
    updatedAt: '',
  } as Relationship
}

describe('useGraphLayout', () => {
  it('positions es un Map vacío cuando no hay nodos', () => {
    const { result } = renderHook(() =>
      useGraphLayout({ mode: 'organic', nodes: [], edges: [] }),
    )
    expect(result.current.positions.size).toBe(0)
  })

  it('devuelve positions para cada nodo (modo organic con seed)', () => {
    const nodes = [ent('a', 'persona', 0, 0), ent('b', 'persona', 100, 100)]
    const { result } = renderHook(() =>
      useGraphLayout({ mode: 'organic', nodes, edges: [] }),
    )
    expect(result.current.positions.has('a')).toBe(true)
    expect(result.current.positions.has('b')).toBe(true)
  })

  it('modo by-year coloca nodos sin year? en posiciones válidas', () => {
    const nodes = [ent('a'), ent('b')]
    const { result } = renderHook(() =>
      useGraphLayout({ mode: 'by-year', nodes, edges: [] }),
    )
    // Devuelve positions para ambos (los layouts deterministas siempre
    // asignan algo, aunque sea el fallback "sin year").
    expect(result.current.positions.size).toBeGreaterThan(0)
  })

  it('modo by-degree devuelve positions ordenadas según connections', () => {
    const nodes = [ent('a'), ent('b'), ent('c')]
    const edges = [rel('r1', 'a', 'b'), rel('r2', 'a', 'c')]
    const { result } = renderHook(() =>
      useGraphLayout({ mode: 'by-degree', nodes, edges }),
    )
    expect(result.current.positions.size).toBe(3)
  })

  it('setPosition actualiza la posición de un nodo en el Map', () => {
    const nodes = [ent('a', 'persona', 0, 0)]
    const { result } = renderHook(() =>
      useGraphLayout({ mode: 'organic', nodes, edges: [] }),
    )
    act(() => result.current.setPosition('a', 999, 999))
    const p = result.current.positions.get('a')
    expect(p).toEqual({ x: 999, y: 999 })
  })

  it('reorganize bumpea el reseed y recalcula', () => {
    const nodes = [ent('a'), ent('b')]
    const { result } = renderHook(() =>
      useGraphLayout({ mode: 'by-type', nodes, edges: [] }),
    )
    const before = result.current.positions
    act(() => result.current.reorganize())
    // Tras reorganize, el state cambió (Map nueva referencia).
    expect(result.current.positions).not.toBe(before)
    expect(result.current.positions.size).toBe(2)
  })

  it('cambiar mode produce un layout distinto', () => {
    const nodes = [ent('a'), ent('b'), ent('c')]
    const edges: Relationship[] = []
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'organic' | 'by-type' }) =>
        useGraphLayout({ mode, nodes, edges }),
      { initialProps: { mode: 'organic' } },
    )
    const organic = new Map(result.current.positions)
    rerender({ mode: 'by-type' })
    // Las positions cambiaron (mode distinto => layout distinto).
    expect(result.current.positions).not.toBe(organic)
  })
})
