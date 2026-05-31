import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entity, Relationship } from '../types'
import { byDegreeLayout } from './layouts/byDegree'
import { byTypeLayout } from './layouts/byType'
import { byYearLayout } from './layouts/byYear'
import { organicLayout } from './layouts/organic'
import type { LayoutEdge, LayoutMode, LayoutNode, Position } from './layouts/types'

type Options = {
  mode: LayoutMode
  nodes: Entity[]
  edges: Relationship[]
}

type LayoutInput = {
  mode: LayoutMode
  nodes: Entity[]
  layoutNodes: LayoutNode[]
  layoutEdges: LayoutEdge[]
  reseed: number
}

function buildLayoutSignature(
  mode: LayoutMode,
  reseed: number,
  nodes: Entity[],
  edges: Relationship[],
) {
  return JSON.stringify({
    mode,
    reseed,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      year: node.year ?? null,
      positionX: node.positionX ?? null,
      positionY: node.positionY ?? null,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      type: edge.type,
    })),
  })
}

/**
 * Computes node positions for the selected mode.
 *
 * Organic mode is the "live" one: it honors persisted positions, drag updates
 * are immediate, and the layout settles only for unseen nodes. The other modes
 * are deterministic geometric arrangements — drag still works (and updates the
 * visible positions) but the values aren't persisted because they only make
 * sense within that mode.
 */
export function useGraphLayout({ mode, nodes, edges }: Options) {
  const cacheRef = useRef<Map<string, Position>>(new Map())
  const layoutInputRef = useRef<LayoutInput | null>(null)
  const [positions, setPositions] = useState<Map<string, Position>>(new Map())
  // Forces a recompute when the user hits "reorganizar".
  const [reseed, setReseed] = useState(0)

  const layoutNodes: LayoutNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    year: n.year ?? null,
  }))
  const layoutEdges: LayoutEdge[] = edges.map((e) => ({
    fromId: e.fromId,
    toId: e.toId,
  }))
  const layoutSignature = buildLayoutSignature(mode, reseed, nodes, edges)
  layoutInputRef.current = { mode, nodes, layoutNodes, layoutEdges, reseed }

  useEffect(() => {
    const input = layoutInputRef.current
    if (!input) return

    if (input.nodes.length === 0) {
      setPositions(new Map())
      return
    }

    let result: Map<string, Position>

    if (input.mode === 'organic') {
      const seed = new Map<string, Position>()
      for (const n of input.nodes) {
        if (n.positionX !== undefined && n.positionY !== undefined) {
          seed.set(n.id, { x: n.positionX, y: n.positionY })
        } else if (input.reseed === 0) {
          const cached = cacheRef.current.get(n.id)
          if (cached) seed.set(n.id, cached)
        }
      }
      result = organicLayout(input.layoutNodes, input.layoutEdges, {
        seed,
        // When the user explicitly hit reorganizar (reseed > 0), throw the
        // persisted positions away and treat them as warm seeds only.
        fixSeeded: input.reseed === 0,
      })
    } else if (input.mode === 'by-type') {
      result = byTypeLayout(input.layoutNodes, input.layoutEdges, input.reseed)
    } else if (input.mode === 'by-year') {
      result = byYearLayout(input.layoutNodes, input.reseed)
    } else {
      result = byDegreeLayout(input.layoutNodes, input.layoutEdges, input.reseed)
    }

    if (input.mode === 'organic') {
      for (const [id, p] of result) cacheRef.current.set(id, p)
    }
    setPositions(result)
  }, [layoutSignature])

  const setPosition = useCallback((id: string, x: number, y: number) => {
    cacheRef.current.set(id, { x, y })
    setPositions((prev) => {
      const next = new Map(prev)
      next.set(id, { x, y })
      return next
    })
  }, [])

  const reorganize = useCallback(() => {
    setReseed((n) => n + 1)
  }, [])

  return { positions, setPosition, reorganize }
}
