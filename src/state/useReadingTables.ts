/**
 * Mesas / proyectos editoriales — hooks. Mismo patrón que useFavoritos: query
 * simple + mutaciones que invalidan, y DELETE con toast accionable de Deshacer
 * (restore por deleted_at exacto).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { ReadingTableStatus } from '../api/readingTables'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

export function useReadingTablesQuery() {
  return useQuery({
    queryKey: queryKeys.readingTables,
    queryFn: () => api.listReadingTables(),
  })
}

export function useCreateReadingTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      title: string
      materialIds?: string[]
      draftMarkdown?: string | null
    }) => api.createReadingTable(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.readingTables }),
  })
}

export function useUpdateReadingTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: {
        title?: string
        materialIds?: string[]
        draftMarkdown?: string | null
        status?: ReadingTableStatus
      }
    }) => api.updateReadingTable(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.readingTables }),
  })
}

export function useDeleteReadingTable() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.removeReadingTable(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.readingTables })
      if (deletedAt) {
        toast.show({
          message: 'Proyecto eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreReadingTable(id, deletedAt)
              qc.invalidateQueries({ queryKey: queryKeys.readingTables })
            },
          },
        })
      }
    },
  })
}
