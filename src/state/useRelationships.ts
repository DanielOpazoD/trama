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
import { useToast } from './toast'
import { type DeleteInput } from './useEntities'

function normalizeDeleteInput(input: DeleteInput): { id: string; silent: boolean } {
  if (typeof input === 'string') return { id: input, silent: false }
  return { id: input.id, silent: input.silent ?? false }
}

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
        // Ver comentario en useEntities: solo offline si el browser
        // confirma falta de red.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setOffline(true)
        }
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

/** BB4: optimistic create. */
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
    onMutate: async (data) => {
      if (offline) return { previous: null, tempId: null }
      await queryClient.cancelQueries({ queryKey: queryKeys.relationships })
      const previous =
        queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
      const tempId = `__optimistic_${newId()}`
      const optimistic: Relationship = {
        ...data,
        id: tempId,
        origin: data.origin ?? DEFAULT_ORIGIN,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, [
        optimistic,
        ...previous,
      ])
      return { previous, tempId }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.relationships, context.previous)
      }
    },
    onSuccess: (created, _vars, context) => {
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (prev) => {
        if (!prev) return [created]
        const tempId = context?.tempId ?? null
        const withoutTemp = tempId ? prev.filter((r) => r.id !== tempId) : prev
        return [created, ...withoutTemp]
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.entityRefsCount })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
    },
  })
}

/** BB4: optimistic update. */
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
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.relationships })
      const previous =
        queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (prev) =>
        (prev ?? []).map((r) =>
          r.id === id
            ? {
                ...r,
                ...(patch.type !== undefined ? { type: patch.type } : {}),
                ...(patch.notes !== undefined ? { notes: patch.notes ?? undefined } : {}),
                updatedAt: nowIso(),
              }
            : r,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.relationships, context.previous)
      }
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
  const toast = useToast()

  return useMutation({
    mutationFn: async (input: DeleteInput) => {
      const { id, silent } = normalizeDeleteInput(input)
      if (offline) return { id, silent, deletedAt: null as string | null }
      const res = await api.deleteRelationship(id)
      return { id, silent, deletedAt: res.deletedAt as string | null }
    },
    onSuccess: ({ id, silent, deletedAt }) => {
      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (prev) =>
        (prev ?? []).filter((r) => r.id !== id),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.entityRefsCount })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
      if (offline) {
        const current = queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
        storage.saveRelationships(current)
      }

      if (deletedAt && !silent && !offline) {
        toast.show({
          message: 'Relación eliminada',
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreRelationship(id, deletedAt)
              queryClient.invalidateQueries({ queryKey: queryKeys.relationships })
              queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.entityRefsCount })
              queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
            },
          },
        })
      }
    },
  })
}
