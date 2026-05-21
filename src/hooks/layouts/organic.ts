import type { LayoutEdge, LayoutNode, LayoutResult } from './types'

/**
 * Hand-rolled Fruchterman-Reingold force-directed layout.
 *
 * Pure JS, no dependencies. Runs synchronously on the main thread.
 * Good enough for up to ~150 nodes. Beyond that, consider a Web Worker
 * or migrating to a real graph library.
 *
 * Accepts optional `seed` positions — nodes with a seed start there and stay
 * still when `fixSeeded` is true. Otherwise they're treated as warm starts but
 * are still subject to forces.
 */
export function organicLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: {
    seed?: Map<string, { x: number; y: number }>
    fixSeeded?: boolean
    iterations?: number
  } = {},
): LayoutResult {
  const { seed, fixSeeded = false, iterations = 350 } = options
  const k = 140
  const repulsion = k * k

  type SimNode = {
    id: string
    x: number
    y: number
    vx: number
    vy: number
    fixed: boolean
  }

  const sim: SimNode[] = nodes.map((node) => {
    const seedPos = seed?.get(node.id)
    if (seedPos) {
      return {
        id: node.id,
        x: seedPos.x,
        y: seedPos.y,
        vx: 0,
        vy: 0,
        fixed: fixSeeded,
      }
    }
    return {
      id: node.id,
      x: (Math.random() - 0.5) * 400,
      y: (Math.random() - 0.5) * 400,
      vx: 0,
      vy: 0,
      fixed: false,
    }
  })

  const anyFree = sim.some((n) => !n.fixed)
  if (!anyFree) {
    const out: LayoutResult = new Map()
    for (const n of sim) out.set(n.id, { x: n.x, y: n.y })
    return out
  }

  const validEdges = edges.filter((e) => e.fromId !== e.toId)

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < sim.length; i++) {
      const a = sim[i]
      a.vx = 0
      a.vy = 0
      for (let j = 0; j < sim.length; j++) {
        if (i === j) continue
        const b = sim[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
      }
      a.vx += -a.x * 0.02
      a.vy += -a.y * 0.02
    }

    for (const edge of validEdges) {
      const a = sim.find((n) => n.id === edge.fromId)
      const b = sim.find((n) => n.id === edge.toId)
      if (!a || !b) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const force = (dist * dist) / k
      const fx = (dx / dist) * force * 0.5
      const fy = (dy / dist) * force * 0.5
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }

    const temperature = Math.max(0.5, 8 * (1 - iter / iterations))
    for (const node of sim) {
      if (node.fixed) continue
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy) + 0.01
      const limited = Math.min(speed, temperature)
      node.x += (node.vx / speed) * limited
      node.y += (node.vy / speed) * limited
    }
  }

  const out: LayoutResult = new Map()
  for (const n of sim) out.set(n.id, { x: n.x, y: n.y })
  return out
}
