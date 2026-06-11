import { describe, it, expect } from 'vitest'
import { computeLayout } from './layoutCompute'
import type { LayoutEdge, LayoutNode } from './types'

/**
 * El contrato del Worker: mismo request serializable → mismas posiciones
 * que el cálculo en el hilo principal (es la MISMA función). Acá se
 * verifica el shape de entries y el respeto de semillas fijas.
 */

const NODES: LayoutNode[] = [
  { id: 'a', type: 'escritor' },
  { id: 'b', type: 'libro' },
  { id: 'c', type: 'concepto' },
]
const EDGES: LayoutEdge[] = [
  { fromId: 'a', toId: 'b' },
  { fromId: 'b', toId: 'c' },
]

describe('computeLayout', () => {
  it('devuelve una posición por nodo en todos los modos', () => {
    for (const mode of ['organic', 'by-type', 'by-year', 'by-degree'] as const) {
      const entries = computeLayout({
        mode,
        layoutNodes: NODES,
        layoutEdges: EDGES,
        reseed: 0,
        seedEntries: [],
        fixSeeded: true,
      })
      expect(entries).toHaveLength(NODES.length)
      for (const [id, pos] of entries) {
        expect(NODES.some((n) => n.id === id)).toBe(true)
        expect(Number.isFinite(pos.x)).toBe(true)
        expect(Number.isFinite(pos.y)).toBe(true)
      }
    }
  })

  it('organic con fixSeeded respeta las posiciones semilla', () => {
    const entries = computeLayout({
      mode: 'organic',
      layoutNodes: NODES,
      layoutEdges: EDGES,
      reseed: 0,
      seedEntries: [['a', { x: 123, y: -45 }]],
      fixSeeded: true,
    })
    const a = entries.find(([id]) => id === 'a')![1]
    expect(a).toEqual({ x: 123, y: -45 })
  })

  it('es determinístico para el mismo request (modos geométricos)', () => {
    const req = {
      mode: 'by-type' as const,
      layoutNodes: NODES,
      layoutEdges: EDGES,
      reseed: 7,
      seedEntries: [] as [string, { x: number; y: number }][],
      fixSeeded: false,
    }
    expect(computeLayout(req)).toEqual(computeLayout(req))
  })
})
