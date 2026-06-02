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
  home: ['home'] as const,
  atlas: ['atlas'] as const,
  cronicas: ['cronicas'] as const,
  cronologiaInfinite: ['cronologia', 'infinite'] as const,
  momentosInfinite: ['momentos', 'infinite'] as const,
  notes: ['notes'] as const,
  tasks: ['tasks'] as const,
  prompts: ['prompts'] as const,
  secrets: ['secrets'] as const,
  notasAttachments: (ownerType: 'note' | 'prompt' | 'week', ownerId: string) =>
    ['notas-attachments', ownerType, ownerId] as const,
  monthNote: (month: string) => ['month-note', month] as const,
  x: ['x'] as const,
  xBookmarks: ['x', 'bookmarks'] as const,
  xStatus: ['x', 'status'] as const,
  xCronica: ['x', 'cronica'] as const,
  chatThreads: ['chat', 'threads'] as const,
  chatMessages: (threadId: string) => ['chat', 'messages', threadId] as const,
  /** U-2: ecos por cita — top-3 similares vía embedding. */
  quoteEchoes: (quoteId: string) => ['quotes', 'echoes', quoteId] as const,
}
