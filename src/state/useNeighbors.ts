import { useQuery } from '@tanstack/react-query'
import { api, type NeighborsResponse } from '../api'

/**
 * Subgraph query: returns the focal entity + N-hop neighbors + edges
 * between them. La base del modo exploratorio del grafo a 100k+ — en vez
 * de cargar todo, navega abriendo vecindades.
 *
 * Disabled cuando focusId es null (la UI muestra entonces un picker).
 */
export function useNeighborsQuery(
  focusId: string | null,
  options?: { hops?: number; limit?: number },
) {
  return useQuery<NeighborsResponse>({
    queryKey: ['graph', 'neighbors', focusId, options?.hops ?? 1, options?.limit ?? 120],
    queryFn: () => api.getNeighbors(focusId as string, options),
    enabled: !!focusId,
    staleTime: 30_000,
  })
}
