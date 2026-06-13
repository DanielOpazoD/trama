/**
 * Recortes — hooks de la bandeja de capturas web. Patrón de la casa
 * (useNotes): query simple + mutaciones que invalidan, DELETE con toast
 * accionable de Deshacer (restore por deleted_at exacto), y promoción
 * que invalida también la colección destino para que el objeto nuevo
 * aparezca sin recargar.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type PromoteRecorteInput } from '../api'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

/** Pide a la IA una sugerencia de curaduría para un recorte (no muta). */
export function useSuggestRecorte() {
  return useMutation({
    mutationFn: (id: string) => api.suggestRecorte(id),
  })
}

export function useRecortesQuery() {
  return useQuery({
    queryKey: queryKeys.recortes,
    queryFn: () => api.listRecortes(),
  })
}

export function useUpdateRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { text?: string; note?: string | null; status?: 'pending' | 'archived' }
    }) => api.updateRecorte(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recortes }),
  })
}

export function useDeleteRecorte() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.removeRecorte(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      if (deletedAt) {
        toast.show({
          message: 'Recorte eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreRecorte(id, deletedAt)
              qc.invalidateQueries({ queryKey: queryKeys.recortes })
            },
          },
        })
      }
    },
  })
}

/** Crea el destino y registra la promoción en el servidor.
 *  Invalida recortes + la colección destino. */
export function usePromoteRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PromoteRecorteInput }) =>
      api.promoteRecorte(id, input),
    onSuccess: (_data, { input }) => {
      const { target } = input
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      if (target === 'quote') {
        qc.invalidateQueries({ queryKey: queryKeys.quotes })
        qc.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      }
      if (target === 'entity') qc.invalidateQueries({ queryKey: queryKeys.entities })
      if (target === 'momento') {
        qc.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
      }
      qc.invalidateQueries({ queryKey: queryKeys.counts })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}
