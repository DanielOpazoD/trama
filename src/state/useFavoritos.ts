/**
 * Favoritos — hooks de las páginas marcadas como favoritas. Mismo patrón que
 * useRecortes: query simple + mutaciones que invalidan, y DELETE con toast
 * accionable de Deshacer (restore por deleted_at exacto).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

export function useFavoritosQuery() {
  return useQuery({
    queryKey: queryKeys.favoritos,
    queryFn: () => api.listFavoritos(),
  })
}

export function useUpdateFavorito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { title?: string | null; note?: string | null }
    }) => api.updateFavorito(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.favoritos }),
  })
}

export function useDeleteFavorito() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.removeFavorito(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.favoritos })
      if (deletedAt) {
        toast.show({
          message: 'Favorito eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreFavorito(id, deletedAt)
              qc.invalidateQueries({ queryKey: queryKeys.favoritos })
            },
          },
        })
      }
    },
  })
}
