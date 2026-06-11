import { byDegreeLayout } from './byDegree'
import { byTypeLayout } from './byType'
import { byYearLayout } from './byYear'
import { organicLayout } from './organic'
import type { LayoutEdge, LayoutMode, LayoutNode, Position } from './types'

/**
 * Cálculo de layout como función pura y SERIALIZABLE — el corazón que
 * comparten el Web Worker (grafos grandes, sin bloquear el hilo de UI)
 * y el fallback síncrono (tests, browsers sin Worker). Las posiciones
 * viajan como arrays de tuplas porque Map no cruza postMessage tipado.
 */

export type LayoutComputeRequest = {
  mode: LayoutMode
  layoutNodes: LayoutNode[]
  layoutEdges: LayoutEdge[]
  reseed: number
  /** Posiciones semilla (persistidas o cacheadas) como entries. */
  seedEntries: [string, Position][]
  /** organic: si las semillas quedan fijas (false tras "reorganizar"). */
  fixSeeded: boolean
}

export type LayoutComputeResponse = [string, Position][]

export function computeLayout(req: LayoutComputeRequest): LayoutComputeResponse {
  let result: Map<string, Position>
  if (req.mode === 'organic') {
    result = organicLayout(req.layoutNodes, req.layoutEdges, {
      seed: new Map(req.seedEntries),
      fixSeeded: req.fixSeeded,
    })
  } else if (req.mode === 'by-type') {
    result = byTypeLayout(req.layoutNodes, req.layoutEdges, req.reseed)
  } else if (req.mode === 'by-year') {
    result = byYearLayout(req.layoutNodes, req.reseed)
  } else {
    result = byDegreeLayout(req.layoutNodes, req.layoutEdges, req.reseed)
  }
  return Array.from(result.entries())
}
