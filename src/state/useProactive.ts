import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ProactiveSuggestion } from '../api'

const PENDING_KEY = ['proactive', 'pending'] as const

export function useProactiveQuery() {
  return useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => api.listProactiveSuggestions('pending'),
  })
}

export function useGenerateProactive() {
  const queryClient = useQueryClient()
  return useMutation({
    // η1: generar sugerencias proactivas es un propose IA — el usuario
    // las acepta o descarta después. Silent.
    meta: { silent: true },
    mutationFn: () => api.generateProactiveSuggestions(),
    onSuccess: ({ suggestions }) => {
      queryClient.setQueryData<ProactiveSuggestion[]>(PENDING_KEY, (prev) => [
        ...suggestions,
        ...(prev ?? []),
      ])
    },
  })
}

export function useResolveProactive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'applied' | 'dismissed' }) => {
      await api.resolveProactiveSuggestion(id, status)
      return { id, status }
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData<ProactiveSuggestion[]>(PENDING_KEY, (prev) =>
        (prev ?? []).filter((s) => s.id !== id),
      )
    },
  })
}
