import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { storage } from '../storage'
import type { Entity, Origin } from '../types'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'

const DEFAULT_ORIGIN: Origin = { kind: 'manual' }

type EntityInput = Omit<Entity, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export function useEntitiesQuery() {
  const { offline, setOffline } = useOffline()
  return useQuery({
    queryKey: queryKeys.entities,
    queryFn: async () => {
      try {
        const result = await api.listEntities()
        if (offline) setOffline(false)
        return result
      } catch (err) {
        setOffline(true)
        return storage.loadEntities()
      }
    },
  })
}

export function useAddEntity() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (data: EntityInput): Promise<Entity> => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const payload = { ...data, origin }
      if (offline) {
        const created: Entity = {
          ...payload,
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        const current = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
        storage.saveEntities([created, ...current])
        return created
      }
      return api.createEntity(payload)
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) => [
        created,
        ...(prev ?? []),
      ])
    },
  })
}

export function useUpdateEntityPosition() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  // We don't useMutation here because position updates are high-frequency.
  // Instead expose a function that does an optimistic local update + debounced API call.
  let debounceTimer: number | null = null
  return (id: string, x: number, y: number) => {
    queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) =>
      (prev ?? []).map((entity) =>
        entity.id === id ? { ...entity, positionX: x, positionY: y } : entity,
      ),
    )
    if (offline) {
      const current = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
      storage.saveEntities(current)
      return
    }
    if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      api.updateEntityPosition(id, x, y).catch(() => {
        // Best-effort; if it fails the local state still reflects the user's drag.
      })
    }, 400)
  }
}

export function useDeleteEntity() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (id: string) => {
      if (!offline) await api.deleteEntity(id)
      return id
    },
    onSuccess: (id) => {
      // Cascade: also remove from relationships and quotes caches.
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) =>
        (prev ?? []).filter((e) => e.id !== id),
      )
      queryClient.setQueryData(queryKeys.relationships, (prev: unknown) => {
        const list = (prev as Array<{ fromId: string; toId: string }> | undefined) ?? []
        return list.filter((r) => r.fromId !== id && r.toId !== id)
      })
      queryClient.setQueryData(queryKeys.quotes, (prev: unknown) => {
        const list = (prev as Array<{ entityId: string }> | undefined) ?? []
        return list.filter((q) => q.entityId !== id)
      })
      if (offline) {
        const e = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
        storage.saveEntities(e)
      }
    },
  })
}
