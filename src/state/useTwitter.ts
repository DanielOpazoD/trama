import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from './queryClient'

/**
 * Bookmarks de X guardados. Se traen todos los vivos de una (a escala personal
 * es lo más simple) y la vista los agrupa por año/mes y filtra por tema.
 * Comparten el prefijo `['x', ...]` con el estado de conexión, así un sync o un
 * borrado invalidan todo con `['x']`.
 */
export function useTwitterBookmarksQuery() {
  return useQuery({
    queryKey: queryKeys.xBookmarks,
    queryFn: () => api.xBookmarks(),
    retry: false,
  })
}

/** Estado de conexión con X (compartido con el panel de Settings). */
export function useXStatusQuery() {
  return useQuery({
    queryKey: queryKeys.xStatus,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.x })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}

/** Clasifica por tema (IA) los bookmarks sin tema; invalida la lista al terminar. */
export function useClassifyBookmarks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.xClassify(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.x })
    },
  })
}

/** La crónica de bookmarks más reciente (se muestra en Twitter e Inicio). */
export function useXCronicaQuery() {
  return useQuery({
    queryKey: queryKeys.xCronica,
    queryFn: () => api.xCronica(),
    retry: false,
  })
}

/** Genera una crónica nueva; invalida la crónica al terminar. */
export function useGenerateXCronica() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.xGenerateCronica(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xCronica })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}

/** Borra (soft-delete) la crónica de bookmarks; invalida crónica + Inicio. */
export function useDeleteXCronica() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.xDeleteCronica(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xCronica })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}
