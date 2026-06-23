import { describe, it, expect } from 'vitest'
import { organicLayout } from './organic'
import type { LayoutEdge, LayoutNode } from './types'

/**
 * organicLayout es un Fruchterman-Reingold hecho a mano. Para nodos SIN seed usa
 * Math.random() (posición inicial), así que el resultado no es determinista en
 * general; pero con nodos sembrados y `fixSeeded` SÍ lo es (los fijos no se
 * mueven). Estos tests fijan esos invariantes estables sin depender del azar.
 */

const node = (id: string, type = 'persona'): LayoutNode => ({ id, type })
const edge = (fromId: string, toId: string): LayoutEdge => ({ fromId, toId })

const allFinite = (pos: { x: number; y: number } | undefined) =>
  pos != null && Number.isFinite(pos.x) && Number.isFinite(pos.y)

describe('organicLayout', () => {
  it('devuelve una posición finita para cada nodo', () => {
    const result = organicLayout([node('a'), node('b'), node('c')], [edge('a', 'b')], {
      iterations: 5,
    })
    expect(result.size).toBe(3)
    for (const id of ['a', 'b', 'c']) expect(allFinite(result.get(id))).toBe(true)
  })

  it('con todos los nodos sembrados y fixSeeded deja las posiciones intactas', () => {
    const seed = new Map([
      ['a', { x: 10, y: 20 }],
      ['b', { x: -30, y: 40 }],
    ])
    const result = organicLayout([node('a'), node('b')], [edge('a', 'b')], {
      seed,
      fixSeeded: true,
    })
    expect(result.get('a')).toEqual({ x: 10, y: 20 })
    expect(result.get('b')).toEqual({ x: -30, y: 40 })
  })

  it('un nodo fijo no se mueve aunque haya otros libres', () => {
    const seed = new Map([['fixed', { x: 100, y: 100 }]])
    const result = organicLayout([node('fixed'), node('free')], [edge('fixed', 'free')], {
      seed,
      fixSeeded: true,
      iterations: 50,
    })
    expect(result.get('fixed')).toEqual({ x: 100, y: 100 })
    expect(allFinite(result.get('free'))).toBe(true)
  })

  it('tolera self-edges (fromId === toId) sin romper', () => {
    const seed = new Map([['a', { x: 1, y: 2 }]])
    const result = organicLayout([node('a')], [edge('a', 'a')], {
      seed,
      fixSeeded: true,
    })
    expect(result.get('a')).toEqual({ x: 1, y: 2 })
  })

  it('tolera aristas que apuntan a nodos inexistentes', () => {
    const seed = new Map([['a', { x: 0, y: 0 }]])
    const result = organicLayout([node('a')], [edge('a', 'fantasma')], {
      seed,
      fixSeeded: true,
    })
    expect(result.size).toBe(1)
    expect(allFinite(result.get('a'))).toBe(true)
  })

  it('devuelve un mapa vacío sin nodos', () => {
    expect(organicLayout([], []).size).toBe(0)
  })
})
