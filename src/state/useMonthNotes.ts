import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from './queryClient'

/** Nota global del mes ('YYYY-MM'). */
export function useMonthNoteQuery(month: string) {
  return useQuery({
    queryKey: queryKeys.monthNote(month),
    queryFn: () => api.monthNotes.get(month),
  })
}

export function useSaveMonthNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ month, content }: { month: string; content: string }) =>
      api.monthNotes.save(month, content),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.monthNote(data.monthKey), data)
    },
  })
}
