import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entity, Relationship } from '../types'
import { byDegreeLayout } from './layouts/byDegree'
import { byTypeLayout } from './layouts/byType'
import { byYearLayout } from './layouts/byYear'
import { organicLayout } from './layouts/organic'
import type {
  LayoutEdge,
  LayoutMode,
  LayoutNode,
  Position,
} from './layouts/types'

type Options = {
  mode: LayoutMode
  nodes: Entity[]
  edges: Relationship[]
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

  const key =
    mode +
    '|' +
    reseed +
    '|' +
    nodes.length +
    ':' +
    nodes.map((n) => `${n.id}:${n.positionX ?? '_'}:${n.positionY ?? '_'}`).join(',') +
    '|' +
    edges.map((e) => e.id).join(',')

  useEffect(() => {
    if (nodes.length === 0) {
      setPositions(new Map())
      return
    }

    let result: Map<string, Position>

    if (mode === 'organic') {
      const seed = new Map<string, Position>()
      for (const n of nodes) {
        if (n.positionX !== undefined && n.positionY !== undefined) {
          seed.set(n.id, { x: n.positionX, y: n.positionY })
        } else if (reseed === 0) {
          const cached = cacheRef.current.get(n.id)
          if (cached) seed.set(n.id, cached)
        }
      }
      result = organicLayout(layoutNodes, layoutEdges, {
        seed,
        // When the user explicitly hit reorganizar (reseed > 0), throw the
        // persisted positions away and treat them as warm seeds only.
        fixSeeded: reseed === 0,
      })
    } else if (mode === 'by-type') {
      result = byTypeLayout(layoutNodes, layoutEdges, reseed)
    } else if (mode === 'by-year') {
      result = byYearLayout(layoutNodes, reseed)
    } else {
      result = byDegreeLayout(layoutNodes, layoutEdges, reseed)
    }

    if (mode === 'organic') {
      for (const [id, p] of result) cacheRef.current.set(id, p)
    }
    setPositions(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

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
