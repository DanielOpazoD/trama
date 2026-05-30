import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

/**
 * Bookmarks de X guardados. Se traen todos los vivos de una (a escala personal
 * es lo más simple) y la vista los agrupa por año/mes y filtra por tema.
 * Comparten el prefijo `['x', ...]` con el estado de conexión, así un sync o un
 * borrado invalidan todo con `['x']`.
 */
const X_BOOKMARKS_KEY = ['x', 'bookmarks'] as const

export function useTwitterBookmarksQuery() {
  return useQuery({
    queryKey: X_BOOKMARKS_KEY,
    queryFn: () => api.xBookmarks(),
    retry: false,
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

/** Soft-delete de un bookmark; invalida la lista al terminar. */
export function useDeleteBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.xDeleteBookmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['x'] })
    },
  })
}
