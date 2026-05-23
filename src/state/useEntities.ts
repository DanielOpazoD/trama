import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import { storage } from '../storage'
import type { Entity, Origin } from '../types'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'
import { useToast } from './toast'

const DEFAULT_ORIGIN: Origin = { kind: 'manual' }

type EntityInput = Omit<Entity, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
  /** When true, skips the server's duplicate-detection guard. Used by AI
      flows that already had the user's approval, and as the "create anyway"
      action on the duplicate warning. */
  _force?: boolean
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
      } catch {
        // Solo marcar offline si el browser CONFIRMA que estamos sin red.
        // Una falla de la API con red disponible (cold start, 503 transient)
        // NO es razón para entrar a modo local. Antes esto disparaba el
        // mensaje "Sin backend" falsamente cuando solo había sido un retry
        // fallido inicial.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setOffline(true)
        }
        return storage.loadEntities()
      }
    },
  })
}

const ENTITIES_PAGE_SIZE = 60

/**
 * Cursor-paginated entities for EntitiesView. La query wholesale
 * (useEntitiesQuery) sigue existiendo para los call sites que aún la
 * necesitan (grafo, búsqueda en sidebar, ProposalPanel matching). Este
 * hook es solo para la lista grande virtualizada.
 */
export function useInfiniteEntitiesQuery() {
  return useInfiniteQuery({
    queryKey: queryKeys.entitiesInfinite,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listEntitiesPage(ENTITIES_PAGE_SIZE, pageParam ?? null),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function useAddEntity() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (data: EntityInput): Promise<Entity> => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const { _force, ...rest } = data
      const payload = { ...rest, origin }
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
      return api.createEntity(payload, { force: _force })
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) => [
        created,
        ...(prev ?? []),
      ])
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
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

export function useUpdateEntityType() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      if (!offline) await api.updateEntityType(id, type)
      return { id, type }
    },
    onSuccess: ({ id, type }) => {
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) =>
        (prev ?? []).map((entity) =>
          entity.id === id ? { ...entity, type } : entity,
        ),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
      if (offline) {
        const e = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
        storage.saveEntities(e)
      }
    },
  })
}

type EntityPatch = Partial<{
  name: string
  type: string
  year: number | null
  description: string | null
  essay: string | null
  spotifyUrl: string | null
}>

export function useUpdateEntity() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EntityPatch }) => {
      if (offline) {
        throw new Error('Editar requiere conexión al backend.')
      }
      return api.updateEntity(id, patch)
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) =>
        (prev ?? []).map((e) => (e.id === updated.id ? updated : e)),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
    },
  })
}

/**
 * Input para useDeleteEntity / useDeleteRelationship / useDeleteQuote.
 *
 * Forma corta `string` para los flujos de usuario directo (botón eliminar);
 * forma objeto con `silent: true` para flujos donde el toast con "Deshacer"
 * sería ruido (aplicar propuestas IA, p. ej., donde el usuario ya confirmó
 * en un modal).
 */
export type DeleteInput = string | { id: string; silent?: boolean }

function normalizeDeleteInput(input: DeleteInput): { id: string; silent: boolean } {
  if (typeof input === 'string') return { id: input, silent: false }
  return { id: input.id, silent: input.silent ?? false }
}

export function useDeleteEntity() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  const toast = useToast()

  return useMutation({
    mutationFn: async (input: DeleteInput) => {
      const { id, silent } = normalizeDeleteInput(input)
      if (offline) return { id, silent, deletedAt: null as string | null }
      const res = await api.deleteEntity(id)
      return { id, silent, deletedAt: res.deletedAt as string | null }
    },
    onSuccess: ({ id, silent, deletedAt }) => {
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
      // Counts moved for entities + cascaded soft-deletes on quotes/rels.
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
      if (offline) {
        const e = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
        storage.saveEntities(e)
      }

      // Toast con Deshacer. Solo cuando hay deletedAt real (online) y el
      // caller no pidió silent.
      if (deletedAt && !silent && !offline) {
        toast.show({
          message: 'Entidad eliminada',
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreEntity(id, deletedAt)
              queryClient.invalidateQueries({ queryKey: queryKeys.entities })
              queryClient.invalidateQueries({ queryKey: queryKeys.relationships })
              queryClient.invalidateQueries({ queryKey: queryKeys.quotes })
              queryClient.invalidateQueries({ queryKey: queryKeys.counts })
              queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
            },
          },
        })
      }
    },
  })
}
