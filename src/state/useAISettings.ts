import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AITaskKey } from '../api'

const KEY = ['ai', 'settings'] as const

export function useAISettingsQuery() {
  return useQuery({ queryKey: KEY, queryFn: () => api.getAISettings() })
}

export function useSetAITaskProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      task,
      provider,
      model,
      verifyWith,
    }: {
      task: AITaskKey
      provider: string
      model?: string | null
      verifyWith?: string | null
    }) => api.setAITaskProvider(task, provider, model ?? null, verifyWith ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
    },
  })
}
