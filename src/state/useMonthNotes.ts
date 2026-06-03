import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { TaskCategory } from '../api'
import { queryKeys } from './queryClient'

/** Nota global del mes ('YYYY-MM') por categoría (Trabajo / Personal). */
export function useMonthNoteQuery(month: string, category: TaskCategory) {
  return useQuery({
    queryKey: queryKeys.monthNote(month, category),
    queryFn: () => api.monthNotes.get(month, category),
  })
}

export function useSaveMonthNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      month,
      category,
      content,
    }: {
      month: string
      category: TaskCategory
      content: string
    }) => api.monthNotes.save(month, category, content),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.monthNote(data.monthKey, data.category), data)
    },
  })
}
