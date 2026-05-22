import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'

/**
 * Aggregate counts (entities / quotes / relationships). Used by the sidebar
 * so it doesn't have to load full lists just to render the badge numbers.
 * Cheap COUNT(*) queries server-side; refresh whenever React Query refetches.
 */
export function useCountsQuery() {
  const { offline } = useOffline()
  return useQuery({
    queryKey: queryKeys.counts,
    queryFn: () => api.getCounts(),
    // Don't try hitting the endpoint while offline; the sidebar will fall
    // back to whatever counts it can derive locally (entities/relationships
    // are loaded fully today, see comment in entities.mts).
    enabled: !offline,
  })
}
