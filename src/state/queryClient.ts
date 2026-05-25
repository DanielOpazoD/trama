import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 2 retries con backoff: protege contra cold-starts de Netlify
      // Functions y 503s transitorios sin marcar la app como offline.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

export const queryKeys = {
  entities: ['entities'] as const,
  entitiesInfinite: ['entities', 'infinite'] as const,
  relationships: ['relationships'] as const,
  relationshipsInfinite: ['relationships', 'infinite'] as const,
  quotes: ['quotes'] as const,
  quotesInfinite: ['quotes', 'infinite'] as const,
  counts: ['counts'] as const,
  entityRefsCount: ['entities', 'refs-count'] as const,
}
