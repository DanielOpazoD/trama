/**
 * τ-worlds Fase 2: hooks de Trama Notas.
 *
 * `useNotesQuery()` lista todas las notas (el filtrado por texto/tag se hace
 * client-side en la vista — instantáneo y sin refetch). Las mutaciones
 * invalidan la cache de notas para mantener la lista fresca.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

export function useNotesQuery() {
  return useQuery({
    queryKey: queryKeys.notes,
    queryFn: () => api.notes.list(),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { content: string; title?: string | null }) =>
      api.notes.create(input.content, { title: input.title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notes }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { content?: string; title?: string | null; pinned?: boolean }
    }) => api.notes.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notes }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.notes })
      // Deshacer: el restore revive nota + anexos con ese deleted_at exacto.
      if (deletedAt) {
        toast.show({
          message: 'Nota eliminada',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.notes.restore(id, deletedAt)
              qc.invalidateQueries({ queryKey: queryKeys.notes })
            },
          },
        })
      }
    },
  })
}

/**
 * Fase 4: promueve una nota a Momento. Al terminar invalida las notas (para
 * que la nota muestre su insignia "→ Momento") y los momentos (para que el
 * nuevo aparezca en la línea de tiempo).
 */
export function usePromoteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.notes.promote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes })
      qc.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}
