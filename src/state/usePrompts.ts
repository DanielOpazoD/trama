import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { PromptCreate, PromptPatch } from '../api'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

const PROMPTS_KEY = queryKeys.prompts

export function usePromptsQuery() {
  return useQuery({
    queryKey: PROMPTS_KEY,
    queryFn: () => api.prompts.list(),
  })
}

export function useCreatePrompt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PromptCreate) => api.prompts.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  })
}

export function useUpdatePrompt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PromptPatch }) =>
      api.prompts.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  })
}

export function useDuplicatePrompt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.prompts.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  })
}

export function useMarkPromptUsed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.prompts.markUsed(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  })
}

export function useDeletePrompt() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.prompts.remove(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: PROMPTS_KEY })
      // Deshacer: revive prompt + anexos con ese deleted_at exacto.
      if (deletedAt) {
        toast.show({
          message: 'Prompt eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.prompts.restore(id, deletedAt)
              qc.invalidateQueries({ queryKey: PROMPTS_KEY })
            },
          },
        })
      }
    },
  })
}
