import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entity, Relationship } from '../types'
import {
  computeLayout,
  type LayoutComputeRequest,
  type LayoutComputeResponse,
} from './layouts/layoutCompute'
import type { LayoutEdge, LayoutMode, LayoutNode, Position } from './layouts/types'

// Umbral para mandar el layout al Worker: por debajo, el cálculo síncrono
// es más barato que el round-trip de postMessage. Por encima (cientos de
// nodos con simulación de fuerzas), el worker evita congelar la UI.
const WORKER_THRESHOLD_NODES = 250
import {
  graphHashToSignature,
  hashGraphPart,
  initialGraphHash,
} from '../lib/graphSignature'

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
  let hash = initialGraphHash()
  hash = hashGraphPart(hash, mode)
  hash = hashGraphPart(hash, reseed)
  hash = hashGraphPart(hash, nodes.length)
  for (const node of nodes) {
    hash = hashGraphPart(hash, node.id)
    hash = hashGraphPart(hash, node.type)
    hash = hashGraphPart(hash, node.year ?? null)
    hash = hashGraphPart(hash, node.positionX ?? null)
    hash = hashGraphPart(hash, node.positionY ?? null)
  }
  hash = hashGraphPart(hash, edges.length)
  for (const edge of edges) {
    hash = hashGraphPart(hash, edge.id)
    hash = hashGraphPart(hash, edge.fromId)
    hash = hashGraphPart(hash, edge.toId)
    hash = hashGraphPart(hash, edge.type)
  }
  return graphHashToSignature(hash)
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
  const workerRef = useRef<Worker | null>(null)
  const seqRef = useRef(0)
  // true mientras el worker teje un layout grande (la UI puede decirlo).
  const [computing, setComputing] = useState(false)

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

    const seedEntries: [string, Position][] = []
    if (input.mode === 'organic') {
      for (const n of input.nodes) {
        if (n.positionX !== undefined && n.positionY !== undefined) {
          seedEntries.push([n.id, { x: n.positionX, y: n.positionY }])
        } else if (input.reseed === 0) {
          const cached = cacheRef.current.get(n.id)
          if (cached) seedEntries.push([n.id, cached])
        }
      }
    }
    const req: LayoutComputeRequest = {
      mode: input.mode,
      layoutNodes: input.layoutNodes,
      layoutEdges: input.layoutEdges,
      reseed: input.reseed,
      seedEntries,
      // When the user explicitly hit reorganizar (reseed > 0), throw the
      // persisted positions away and treat them as warm seeds only.
      fixSeeded: input.reseed === 0,
    }

    const apply = (entries: LayoutComputeResponse) => {
      const result = new Map(entries)
      if (input.mode === 'organic') {
        for (const [id, p] of result) cacheRef.current.set(id, p)
      }
      setComputing(false)
      setPositions(result)
    }

    // Grafos grandes → Worker (la simulación de fuerzas no congela la UI).
    // Grafos chicos o entorno sin Worker (tests) → cálculo síncrono.
    if (
      input.layoutNodes.length >= WORKER_THRESHOLD_NODES &&
      typeof Worker !== 'undefined'
    ) {
      const seq = ++seqRef.current
      try {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('./layouts/layout.worker.ts', import.meta.url),
            { type: 'module' },
          )
        }
        const worker = workerRef.current
        worker.onmessage = (
          event: MessageEvent<{ seq: number; entries: LayoutComputeResponse }>,
        ) => {
          // Respuestas viejas (otro layout pedido mientras tanto) se descartan.
          if (event.data.seq !== seqRef.current) return
          apply(event.data.entries)
        }
        worker.onerror = () => {
          // Worker roto (CSP, build exótico): degradar a síncrono.
          if (seq !== seqRef.current) return
          apply(computeLayout(req))
        }
        setComputing(true)
        worker.postMessage({ seq, req })
        return
      } catch {
        /* new Worker falló — síncrono */
      }
    }
    apply(computeLayout(req))
  }, [layoutSignature])

  // El worker vive lo que vive el componente.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

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

  return { positions, setPosition, reorganize, computing }
}
