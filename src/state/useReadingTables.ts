/**
 * Mesas / proyectos editoriales — hooks consumidos por Home y el panel
 * editorial. Create/delete viven en la API, pero no exponemos wrappers de
 * estado hasta que exista una UI real que los consuma.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { ReadingTableStatus } from '../api/readingTables'
import { queryKeys } from './queryClient'

export function useReadingTablesQuery() {
  return useQuery({
    queryKey: queryKeys.readingTables,
    queryFn: () => api.listReadingTables(),
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
