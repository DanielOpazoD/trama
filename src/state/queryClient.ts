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
  momentoShareInvitations: ['momentos', 'share-invitations'] as const,
  momentoShareAccess: ['momentos', 'share-access'] as const,
  momentoFeedback: (momentoId: string) => ['momentos', 'feedback', momentoId] as const,
  notes: ['notes'] as const,
  recortes: ['recortes'] as const,
  favoritos: ['favoritos'] as const,
  readingTables: ['reading-tables'] as const,
  apiTokens: ['api-tokens'] as const,
  whatsappLinks: ['whatsapp-links'] as const,
  // ['tasks'] es el prefijo de TODOS los queries de tareas (completo, por rango,
  // pendientes); invalidar este prefijo refresca cualquier variante en cache.
  tasks: ['tasks'] as const,
  tasksRange: (weekFrom: string, weekTo: string, carryBefore: string | null) =>
    ['tasks', 'range', weekFrom, weekTo, carryBefore] as const,
  tasksPending: ['tasks', 'pending'] as const,
  prompts: ['prompts'] as const,
  secrets: ['secrets'] as const,
  notasAttachments: (ownerType: 'note' | 'prompt' | 'week' | 'task', ownerId: string) =>
    ['notas-attachments', ownerType, ownerId] as const,
  monthNote: (month: string, category: string) =>
    ['month-note', month, category] as const,
  userPrefs: ['user-prefs'] as const,
  x: ['x'] as const,
  xBookmarks: ['x', 'bookmarks'] as const,
  xStatus: ['x', 'status'] as const,
  xCronica: ['x', 'cronica'] as const,
  chatThreads: ['chat', 'threads'] as const,
  chatMessages: (threadId: string) => ['chat', 'messages', threadId] as const,
  /** U-2: ecos por cita — top-3 similares vía embedding. */
  quoteEchoes: (quoteId: string) => ['quotes', 'echoes', quoteId] as const,
  /** Fase 4: consultas guardadas del usuario. */
  savedQueries: ['saved-queries'] as const,
}
