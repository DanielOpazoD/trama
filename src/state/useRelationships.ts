import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import { storage } from '../storage'
import type { Origin, Relationship } from '../types'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'

const DEFAULT_ORIGIN: Origin = { kind: 'manual' }

type RelationshipInput = Omit<Relationship, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export function useRelationshipsQuery() {
  const { setOffline, offline } = useOffline()
  return useQuery({
    queryKey: queryKeys.relationships,
    queryFn: async () => {
      try {
        const result = await api.listRelationships()
        if (offline) setOffline(false)
        return result
      } catch {
        setOffline(true)
        return storage.loadRelationships()
      }
    },
  })
}

const RELATIONSHIPS_PAGE_SIZE = 60

/**
 * Cursor-paginated relationships para RelationshipsView. La wholesale
 * (useRelationshipsQuery) sigue para el grafo y lookups que necesitan
 * la lista completa.
 */
export function useInfiniteRelationshipsQuery() {
  return useInfiniteQuery({
    queryKey: queryKeys.relationshipsInfinite,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listRelationshipsPage(RELATIONSHIPS_PAGE_SIZE, pageParam ?? null),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function useAddRelationship() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (data: RelationshipInput): Promise<Relationship> => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const payload = { ...data, origin }
      if (offline) {
        const created: Relationship = {
          ...payload,
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        const current = queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
        storage.saveRelationships([created, ...current])
        return created
      }
      return api.createRelationship(payload)
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (prev) => [
        created,
        ...(prev ?? []),
      ])
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
    },
  })
}

export function useUpdateRelationship() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<{ type: string; notes: string | null }>
    }) => {
      if (offline) throw new Error('Editar requiere conexión al backend.')
      return api.updateRelationship(id, patch)
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (prev) =>
        (prev ?? []).map((r) => (r.id === updated.id ? updated : r)),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
    },
  })
}

export function useDeleteRelationship() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (id: string) => {
      if (!offline) await api.deleteRelationship(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (prev) =>
        (prev ?? []).filter((r) => r.id !== id),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
      if (offline) {
        const current = queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
        storage.saveRelationships(current)
      }
    },
  })
}
