import { describe, expect, it } from 'vitest'
import { byYearLayout } from './byYear'
import type { LayoutNode } from './types'

describe('byYearLayout', () => {
  it('orders nodes by year along the x-axis', () => {
    const nodes: LayoutNode[] = [
      { id: 'a', type: 'persona', year: 1850 },
      { id: 'b', type: 'persona', year: 1950 },
      { id: 'c', type: 'persona', year: 2000 },
    ]
    const out = byYearLayout(nodes)
    const xs = ['a', 'b', 'c'].map((id) => out.get(id)!.x)
    expect(xs[0]).toBeLessThan(xs[1])
    expect(xs[1]).toBeLessThan(xs[2])
  })

  it('stacks same-year nodes alternating around the timeline', () => {
    const nodes: LayoutNode[] = [
      { id: 'a', type: 'persona', year: 1900 },
      { id: 'b', type: 'persona', year: 1900 },
      { id: 'c', type: 'persona', year: 1900 },
    ]
    const out = byYearLayout(nodes)
    const xs = ['a', 'b', 'c'].map((id) => out.get(id)!.x)
    // Same year → same x.
    expect(xs[0]).toBe(xs[1])
    expect(xs[1]).toBe(xs[2])
    // Different y so they don't overlap.
    const ys = ['a', 'b', 'c'].map((id) => out.get(id)!.y)
    expect(new Set(ys).size).toBeGreaterThan(1)
  })

  it('places year-less nodes in a separate strip above the timeline', () => {
    const nodes: LayoutNode[] = [
      { id: 'a', type: 'persona', year: 1900 },
      { id: 'b', type: 'concepto' }, // no year
      { id: 'c', type: 'concepto', year: null },
    ]
    const out = byYearLayout(nodes)
    const yearY = out.get('a')!.y
    const noYearYs = [out.get('b')!.y, out.get('c')!.y]
    for (const y of noYearYs) expect(y).toBeLessThan(yearY - 100)
  })

  it('handles all-year-less input gracefully', () => {
    const nodes: LayoutNode[] = [
      { id: 'a', type: 'concepto' },
      { id: 'b', type: 'concepto' },
    ]
    const out = byYearLayout(nodes)
    expect(out.size).toBe(2)
  })

  it('handles empty input', () => {
    expect(byYearLayout([]).size).toBe(0)
  })
})
