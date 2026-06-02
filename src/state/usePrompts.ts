import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { PromptCreate, PromptPatch } from '../api'
import { queryKeys } from './queryClient'

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
  return useMutation({
    mutationFn: (id: string) => api.prompts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  })
}
