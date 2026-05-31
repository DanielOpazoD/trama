import { useRef } from 'react'
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

/**
 * DD3: counts de citas + relaciones por entidad, calculados en el server.
 * Antes EntitiesView usaba useQuotesQuery() + useRelationshipsQuery()
 * wholesome solo para construir los Maps de count en memoria. A 10k+
 * entidades eso descarga MBs de datos para renderizar dos números.
 *
 * Devuelve un Map<id, { quoteCount, relCount }>. El caller hace O(1)
 * lookup. staleTime alto porque solo cambia con mutations explícitas.
 */
export function useEntityRefsCountQuery() {
  return useQuery({
    queryKey: queryKeys.entityRefsCount,
    queryFn: async () => {
      const res = await api.listEntityRefsCount()
      const map = new Map<string, { quoteCount: number; relCount: number }>()
      for (const item of res.items) {
        map.set(item.id, { quoteCount: item.quoteCount, relCount: item.relCount })
      }
      return map
    },
    staleTime: 60_000,
  })
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

/**
 * BB4: las mutations de escritura ahora aplican el cambio en cache antes
 * del round-trip al servidor (optimistic update). En éxito reemplazan el
 * temp con el row real; en error revierten al snapshot anterior. La UI
 * deja de tener el delay perceptible entre "Guardar" y verlo en la lista.
 */
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
    onMutate: async (data) => {
      // Online-only: en offline el mutationFn ya hace el insert y devuelve.
      if (offline) return { previous: null, tempId: null }
      await queryClient.cancelQueries({ queryKey: queryKeys.entities })
      const previous = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
      const tempId = `__optimistic_${newId()}`
      const optimistic: Entity = {
        ...data,
        id: tempId,
        origin: data.origin ?? DEFAULT_ORIGIN,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      queryClient.setQueryData<Entity[]>(queryKeys.entities, [optimistic, ...previous])
      return { previous, tempId }
    },
    onError: (_err, _vars, context) => {
      // Reponer el snapshot. Si el server respondió 409 (DuplicateEntityError),
      // la UI muestra el dropdown "¿quisiste decir…?" — el rollback acá deja
      // la lista exactamente como estaba antes del intento.
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.entities, context.previous)
      }
    },
    onSuccess: (created, _vars, context) => {
      // Reemplazar el temp por el row real (con id de server, embeddings
      // listas, etc.). Si no había temp (offline), apenas prepender.
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) => {
        if (!prev) return [created]
        const tempId = context?.tempId ?? null
        const withoutTemp = tempId ? prev.filter((e) => e.id !== tempId) : prev
        return [created, ...withoutTemp]
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      queryClient.invalidateQueries({ queryKey: queryKeys.entityRefsCount })
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
    },
  })
}

export function useUpdateEntityPosition() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  const debounceTimerRef = useRef<number | null>(null)

  // We don't useMutation here because position updates are high-frequency.
  // Instead expose a function that does an optimistic local update + debounced API call.
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
    if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
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
        (prev ?? []).map((entity) => (entity.id === id ? { ...entity, type } : entity)),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
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
  spotifyUrl: string | null
  wikipediaUrl: string | null
  grokipediaUrl: string | null
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
    onMutate: async ({ id, patch }) => {
      // BB4: aplicar el patch en memoria al instante.
      await queryClient.cancelQueries({ queryKey: queryKeys.entities })
      const previous = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) =>
        (prev ?? []).map((e) =>
          e.id === id
            ? {
                ...e,
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.type !== undefined ? { type: patch.type } : {}),
                ...(patch.year !== undefined ? { year: patch.year ?? undefined } : {}),
                ...(patch.description !== undefined
                  ? { description: patch.description ?? undefined }
                  : {}),
                ...(patch.spotifyUrl !== undefined
                  ? { spotifyUrl: patch.spotifyUrl ?? undefined }
                  : {}),
                ...(patch.wikipediaUrl !== undefined
                  ? { wikipediaUrl: patch.wikipediaUrl ?? undefined }
                  : {}),
                ...(patch.grokipediaUrl !== undefined
                  ? { grokipediaUrl: patch.grokipediaUrl ?? undefined }
                  : {}),
                updatedAt: nowIso(),
              }
            : e,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.entities, context.previous)
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Entity[]>(queryKeys.entities, (prev) =>
        (prev ?? []).map((e) => (e.id === updated.id ? updated : e)),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.entityRefsCount })
      queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
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
              queryClient.invalidateQueries({ queryKey: queryKeys.entityRefsCount })
              queryClient.invalidateQueries({ queryKey: queryKeys.entitiesInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.relationshipsInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.home })
              queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
              queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
            },
          },
        })
      }
    },
  })
}

/**
 * V-3 Voz de…: genera una lectura activa en primera persona a partir de las
 * citas reunidas de una entidad. No persiste — el resultado es lectura, no
 * dato. Silent: la UI muestra "pensando…" en el botón inline; el indicador
 * global "guardando" sería ruido.
 */
export function useVoiceOfEntity() {
  const { offline } = useOffline()
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, question }: { id: string; question: string }) => {
      if (offline) throw new Error('La voz IA requiere conexión al backend.')
      return api.voiceOfEntity(id, question)
    },
  })
}
