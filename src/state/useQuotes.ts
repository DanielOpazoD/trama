import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import { storage } from '../storage'
import type { Origin, Quote } from '../types'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'
import { useToast } from './toast'
import { type DeleteInput } from './useEntities'

function normalizeDeleteInput(input: DeleteInput): { id: string; silent: boolean } {
  if (typeof input === 'string') return { id: input, silent: false }
  return { id: input.id, silent: input.silent ?? false }
}

const DEFAULT_ORIGIN: Origin = { kind: 'manual' }

type QuoteInput = Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'origin' | 'linkedQuoteIds'> & {
  origin?: Origin
  linkedQuoteIds?: string[]
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export function useQuotesQuery() {
  const { setOffline, offline } = useOffline()
  return useQuery({
    queryKey: queryKeys.quotes,
    queryFn: async () => {
      try {
        const result = await api.listQuotes()
        if (offline) setOffline(false)
        return result
      } catch {
        // Ver comentario equivalente en useEntities: solo marcamos offline
        // si el browser confirma falta de red, no por errores transient
        // de la API.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setOffline(true)
        }
        return storage.loadQuotes()
      }
    },
  })
}

const QUOTES_PAGE_SIZE = 50

/**
 * Cursor-paginated quotes for the long list in QuotesView. Each page is N
 * items; scroll triggers fetchNextPage. The other consumers (HomeView
 * featured quote, sidebar count) keep using useQuotesQuery, which loads
 * everything — until commit 3 introduces /api/counts and lighter shapes.
 */
export function useInfiniteQuotesQuery() {
  return useInfiniteQuery({
    queryKey: queryKeys.quotesInfinite,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listQuotesPage(QUOTES_PAGE_SIZE, pageParam ?? null),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

/**
 * BB4: optimistic — insert un Quote temporal en cache antes del round-trip,
 * y reemplazar con el real al volver. Si el server rechaza, rollback al
 * snapshot.
 */
export function useAddQuote() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (data: QuoteInput): Promise<Quote> => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const linkedQuoteIds = data.linkedQuoteIds ?? []
      const payload = { ...data, origin, linkedQuoteIds }
      if (offline) {
        const created: Quote = {
          ...payload,
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        const current = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []
        storage.saveQuotes([created, ...current])
        return created
      }
      return api.createQuote(payload)
    },
    onMutate: async (data) => {
      if (offline) return { previous: null, tempId: null }
      await queryClient.cancelQueries({ queryKey: queryKeys.quotes })
      const previous = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      const tempId = `__optimistic_${newId()}`
      const optimistic: Quote = {
        ...data,
        id: tempId,
        origin: data.origin ?? DEFAULT_ORIGIN,
        linkedQuoteIds: data.linkedQuoteIds ?? [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, [optimistic, ...previous])
      return { previous, tempId }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.quotes, context.previous)
      }
    },
    onSuccess: (created, _vars, context) => {
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (prev) => {
        if (!prev) return [created]
        const tempId = context?.tempId ?? null
        const withoutTemp = tempId ? prev.filter((q) => q.id !== tempId) : prev
        return [created, ...withoutTemp]
      })
      // Reset the infinite list so QuotesView re-fetches from the top and
      // the new quote appears in page 1 without dedupe gymnastics.
      queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
    },
  })
}

type QuotePatch = Partial<{
  text: string
  source: string | null
  context: string | null
  entityId: string
  userReflection: string | null
  aiReflection: string | null
  aiReflectionProvider: string | null
  aiReflectionModel: string | null
  linkedQuoteIds: string[]
  pinned: boolean
}>

export function useUpdateQuote() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: QuotePatch }) => {
      if (offline) throw new Error('Editar requiere conexión al backend.')
      return api.updateQuote(id, patch)
    },
    onMutate: async ({ id, patch }) => {
      // BB4: aplicar el patch en cache al instante. La estrella ω-E (pinned)
      // y la edición inline de texto se sienten instantáneas.
      await queryClient.cancelQueries({ queryKey: queryKeys.quotes })
      const previous = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (prev) =>
        (prev ?? []).map((q) =>
          q.id === id
            ? {
                ...q,
                ...(patch.text !== undefined ? { text: patch.text } : {}),
                ...(patch.source !== undefined ? { source: patch.source ?? undefined } : {}),
                ...(patch.context !== undefined ? { context: patch.context ?? undefined } : {}),
                ...(patch.entityId !== undefined ? { entityId: patch.entityId } : {}),
                ...(patch.userReflection !== undefined
                  ? { userReflection: patch.userReflection ?? undefined }
                  : {}),
                ...(patch.aiReflection !== undefined
                  ? { aiReflection: patch.aiReflection ?? undefined }
                  : {}),
                ...(patch.linkedQuoteIds !== undefined
                  ? { linkedQuoteIds: patch.linkedQuoteIds }
                  : {}),
                ...(patch.pinned !== undefined
                  ? { pinnedAt: patch.pinned ? nowIso() : undefined }
                  : {}),
                updatedAt: nowIso(),
              }
            : q,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.quotes, context.previous)
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (prev) =>
        (prev ?? []).map((q) => (q.id === updated.id ? updated : q)),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
    },
  })
}

/**
 * Generate an on-demand AI interpretation for a quote.
 *
 * The result is returned but NOT persisted — the caller decides whether to
 * save it (via useUpdateQuote) or discard. This keeps the "AI scribe, human
 * curates" contract: the model produces a reading, the user decides.
 */
export function useReflectQuote() {
  const { offline } = useOffline()
  return useMutation({
    // η1: la reflexión IA persiste pero el usuario la dispara desde un
    // botón inline que ya muestra "pensando…". El indicador global
    // "guardando" sería redundante. Silent.
    meta: { silent: true },
    mutationFn: async (id: string) => {
      if (offline) throw new Error('La reflexión IA requiere conexión al backend.')
      return api.reflectQuote(id)
    },
  })
}

export function useDeleteQuote() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  const toast = useToast()

  return useMutation({
    mutationFn: async (input: DeleteInput) => {
      const { id, silent } = normalizeDeleteInput(input)
      if (offline) return { id, silent, deletedAt: null as string | null }
      const res = await api.deleteQuote(id)
      return { id, silent, deletedAt: res.deletedAt as string | null }
    },
    onSuccess: ({ id, silent, deletedAt }) => {
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (prev) =>
        (prev ?? []).filter((q) => q.id !== id),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.counts })
      if (offline) {
        const current = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []
        storage.saveQuotes(current)
      }

      if (deletedAt && !silent && !offline) {
        toast.show({
          message: 'Cita eliminada',
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreQuote(id, deletedAt)
              queryClient.invalidateQueries({ queryKey: queryKeys.quotes })
              queryClient.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
              queryClient.invalidateQueries({ queryKey: queryKeys.counts })
            },
          },
        })
      }
    },
  })
}
