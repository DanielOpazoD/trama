/**
 * Subgrafo de vecinos (hops + limit). Reemplaza el "cargar todo el grafo"
 * cuando se exploran nodos específicos.
 */

import type { Entity, Relationship } from '../types'
import { request } from './request'

export type NeighborWithHop = Entity & { hopDistance: number }

export type NeighborsResponse = {
  from: NeighborWithHop
  entities: NeighborWithHop[]
  relationships: Relationship[]
  hops: number
  limit: number
  truncated: boolean
}

export const graphApi = {
  // Subgrafo de vecinos: úselo en vez de "cargar todo el grafo". GraphView
  // se refactorizará para consumir esto progresivamente.
  async getNeighbors(
    fromId: string,
    options?: { hops?: number; limit?: number },
  ): Promise<NeighborsResponse> {
    const params = new URLSearchParams({ from: fromId })
    if (options?.hops) params.set('hops', String(options.hops))
    if (options?.limit) params.set('limit', String(options.limit))
    return request<NeighborsResponse>(`/api/graph/neighbors?${params.toString()}`)
  },
}
