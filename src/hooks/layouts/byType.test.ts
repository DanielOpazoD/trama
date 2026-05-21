import { describe, expect, it } from 'vitest'
import { byTypeLayout } from './byType'
import type { LayoutNode } from './types'

const NODES: LayoutNode[] = [
  { id: 'a', type: 'persona' },
  { id: 'b', type: 'persona' },
  { id: 'c', type: 'libro' },
  { id: 'd', type: 'libro' },
  { id: 'e', type: 'libro' },
  { id: 'f', type: 'concepto' },
]

describe('byTypeLayout', () => {
  it('returns a position for every node', () => {
    const out = byTypeLayout(NODES, [])
    expect(out.size).toBe(NODES.length)
    for (const n of NODES) expect(out.has(n.id)).toBe(true)
  })

  it('clusters same-type nodes near each other', () => {
    const out = byTypeLayout(NODES, [])
    const personas = ['a', 'b'].map((id) => out.get(id)!)
    const libros = ['c', 'd', 'e'].map((id) => out.get(id)!)

    function avg(points: Array<{ x: number; y: number }>) {
      return {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length,
      }
    }
    function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const personasCenter = avg(personas)
    const librosCenter = avg(libros)

    // Inter-cluster distance (centers) must exceed intra-cluster spread.
    const interDist = dist(personasCenter, librosCenter)
    const personaSpread = Math.max(...personas.map((p) => dist(p, personasCenter)))
    const libroSpread = Math.max(...libros.map((p) => dist(p, librosCenter)))

    expect(interDist).toBeGreaterThan(personaSpread)
    expect(interDist).toBeGreaterThan(libroSpread)
  })

  it('handles single-member type buckets without error', () => {
    const out = byTypeLayout(NODES, [])
    expect(out.get('f')).toBeDefined()
    expect(typeof out.get('f')!.x).toBe('number')
    expect(typeof out.get('f')!.y).toBe('number')
  })

  it('handles empty input', () => {
    expect(byTypeLayout([], []).size).toBe(0)
  })
})
