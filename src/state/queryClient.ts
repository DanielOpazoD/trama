import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

export const queryKeys = {
  entities: ['entities'] as const,
  relationships: ['relationships'] as const,
  quotes: ['quotes'] as const,
  quotesInfinite: ['quotes', 'infinite'] as const,
  counts: ['counts'] as const,
}
