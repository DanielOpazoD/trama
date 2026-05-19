/**
 * Hand-rolled Fruchterman-Reingold force-directed layout.
 *
 * Pure JS, no dependencies. Runs synchronously on the main thread.
 * Good enough for up to ~150 nodes. Beyond that, consider a Web Worker
 * or migrating to a real graph library.
 */

import { useEffect, useRef, useState } from 'react'

export type LayoutNode = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  fixed?: boolean
}

export type LayoutEdge = { from: string; to: string }

export function runForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  iterations = 350,
): void {
  const k = 140 // ideal edge length
  const repulsion = k * k

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between every pair of nodes.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      a.vx = 0
      a.vy = 0
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
      }
      // Gentle gravity toward origin.
      a.vx += -a.x * 0.02
      a.vy += -a.y * 0.02
    }

    // Attraction along edges.
    for (const edge of edges) {
      const a = nodes.find((n) => n.id === edge.from)
      const b = nodes.find((n) => n.id === edge.to)
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

    // Apply with a cooling factor. Fixed nodes don't move.
    const temperature = Math.max(0.5, 8 * (1 - iter / iterations))
    for (const node of nodes) {
      if (node.fixed) continue
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy) + 0.01
      const limited = Math.min(speed, temperature)
      node.x += (node.vx / speed) * limited
      node.y += (node.vy / speed) * limited
    }
  }
}

type GraphInput = {
  nodes: Array<{ id: string; positionX?: number; positionY?: number }>
  edges: Array<{ id: string; fromId: string; toId: string }>
}

/**
 * Returns a Map<id, {x,y}> with positions for each node.
 *
 * Strategy:
 * - If the node has a persisted position, use it as fixed.
 * - If we've seen it before in this session (cached), use that as fixed.
 * - Otherwise place it randomly and let force layout settle.
 * - Only nodes lacking a known position trigger a relayout; placed ones stay put.
 */
export function useForceLayout(input: GraphInput) {
  const cacheRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  )

  const layoutKey =
    input.nodes.length +
    ':' +
    input.nodes.map((n) => n.id).join(',') +
    '|' +
    input.edges.map((e) => e.id).join(',')

  useEffect(() => {
    if (input.nodes.length === 0) {
      setPositions(new Map())
      return
    }

    const simNodes: LayoutNode[] = input.nodes.map((node) => {
      if (node.positionX !== undefined && node.positionY !== undefined) {
        cacheRef.current.set(node.id, { x: node.positionX, y: node.positionY })
        return { id: node.id, x: node.positionX, y: node.positionY, vx: 0, vy: 0, fixed: true }
      }
      const cached = cacheRef.current.get(node.id)
      if (cached) {
        return { id: node.id, x: cached.x, y: cached.y, vx: 0, vy: 0, fixed: true }
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

    const anyFree = simNodes.some((n) => !n.fixed)
    if (anyFree) {
      const layoutEdges: LayoutEdge[] = input.edges
        .filter((e) => e.fromId !== e.toId)
        .map((e) => ({ from: e.fromId, to: e.toId }))
      runForceLayout(simNodes, layoutEdges)
    }

    const next = new Map<string, { x: number; y: number }>()
    for (const node of simNodes) {
      next.set(node.id, { x: node.x, y: node.y })
      cacheRef.current.set(node.id, { x: node.x, y: node.y })
    }
    setPositions(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  /** Manually update a node's position (e.g. from a drag). */
  function setPosition(id: string, x: number, y: number) {
    cacheRef.current.set(id, { x, y })
    setPositions((prev) => {
      const next = new Map(prev)
      next.set(id, { x, y })
      return next
    })
  }

  return { positions, setPosition }
}
