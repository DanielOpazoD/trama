import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { SecretCreate, SecretPatch } from '../api'
import { queryKeys } from './queryClient'

const SECRETS_KEY = queryKeys.secrets

export function useSecretsQuery(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SECRETS_KEY,
    queryFn: () => api.secrets.list(),
    enabled: opts?.enabled ?? true,
  })
}

export function useCreateSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SecretCreate) => api.secrets.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECRETS_KEY }),
  })
}

export function useUpdateSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SecretPatch }) =>
      api.secrets.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECRETS_KEY }),
  })
}

export function useRevealSecret() {
  return useMutation({
    mutationFn: (id: string) => api.secrets.reveal(id),
  })
}

export function useMarkSecretCopied() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.secrets.markCopied(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECRETS_KEY }),
  })
}

export function useDeleteSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.secrets.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECRETS_KEY }),
  })
}
