import { describe, expect, it } from 'vitest'
import { byDegreeLayout } from './byDegree'
import type { LayoutEdge, LayoutNode } from './types'

describe('byDegreeLayout', () => {
  it('places the most-connected node at the center', () => {
    const nodes: LayoutNode[] = [
      { id: 'hub', type: 'persona' },
      { id: 'a', type: 'persona' },
      { id: 'b', type: 'persona' },
      { id: 'c', type: 'persona' },
    ]
    const edges: LayoutEdge[] = [
      { fromId: 'hub', toId: 'a' },
      { fromId: 'hub', toId: 'b' },
      { fromId: 'hub', toId: 'c' },
    ]
    const out = byDegreeLayout(nodes, edges)
    const hub = out.get('hub')!
    expect(hub.x).toBe(0)
    expect(hub.y).toBe(0)
  })

  it('puts every node at a position', () => {
    const nodes: LayoutNode[] = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      type: 'persona',
    }))
    const edges: LayoutEdge[] = []
    const out = byDegreeLayout(nodes, edges)
    expect(out.size).toBe(12)
  })

  it('orders nodes outward by decreasing degree', () => {
    const nodes: LayoutNode[] = [
      { id: 'most', type: 'persona' },
      { id: 'mid', type: 'persona' },
      { id: 'least', type: 'persona' },
      { id: 'iso', type: 'persona' },
    ]
    const edges: LayoutEdge[] = [
      // most: 3 connections
      { fromId: 'most', toId: 'mid' },
      { fromId: 'most', toId: 'least' },
      { fromId: 'most', toId: 'iso' },
      // mid: 2 connections (most + least)
      { fromId: 'mid', toId: 'least' },
      // least: 2 connections (most + mid). iso: 1 (most).
    ]
    const out = byDegreeLayout(nodes, edges)
    const distFromCenter = (id: string) => {
      const p = out.get(id)!
      return Math.hypot(p.x, p.y)
    }
    expect(distFromCenter('most')).toBeLessThan(distFromCenter('mid'))
    expect(distFromCenter('mid')).toBeLessThanOrEqual(distFromCenter('iso'))
  })

  it('ignores self-loops when computing degree', () => {
    const nodes: LayoutNode[] = [
      { id: 'a', type: 'persona' },
      { id: 'b', type: 'persona' },
    ]
    const edges: LayoutEdge[] = [
      { fromId: 'a', toId: 'a' }, // self-loop, should not count
      { fromId: 'a', toId: 'b' },
    ]
    const out = byDegreeLayout(nodes, edges)
    // 'a' has degree 1 (only the a→b edge counts), 'b' has degree 1 → tie.
    // Tie-break by id: 'a' < 'b' alphabetically, so 'a' is placed first (origin).
    expect(out.get('a')).toEqual({ x: 0, y: 0 })
  })

  it('handles empty input', () => {
    expect(byDegreeLayout([], []).size).toBe(0)
  })
})
