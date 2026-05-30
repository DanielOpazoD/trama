import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '../api'

/**
 * Bookmarks de X guardados, paginados por cursor (infinite scroll en la vista
 * Twitter). Comparten el prefijo de key `['x', ...]` con el estado de conexión,
 * así un sync puede invalidar todo con `['x']`.
 */
const X_BOOKMARKS_KEY = ['x', 'bookmarks'] as const
const PAGE_SIZE = 50

export function useTwitterBookmarksQuery() {
  return useInfiniteQuery({
    queryKey: X_BOOKMARKS_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.xBookmarks(PAGE_SIZE, pageParam ?? null),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

/** Estado de conexión con X (compartido con el panel de Settings). */
export function useXStatusQuery() {
  return useQuery({
    queryKey: ['x', 'status'],
    queryFn: () => api.xStatus(),
    retry: false,
  })
}
