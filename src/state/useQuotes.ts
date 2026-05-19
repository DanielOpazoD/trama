import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { storage } from '../storage'
import type { Origin, Quote } from '../types'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'

const DEFAULT_ORIGIN: Origin = { kind: 'manual' }

type QuoteInput = Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
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
        setOffline(true)
        return storage.loadQuotes()
      }
    },
  })
}

export function useAddQuote() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (data: QuoteInput): Promise<Quote> => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const payload = { ...data, origin }
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
    onSuccess: (created) => {
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (prev) => [
        created,
        ...(prev ?? []),
      ])
    },
  })
}

export function useDeleteQuote() {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return useMutation({
    mutationFn: async (id: string) => {
      if (!offline) await api.deleteQuote(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (prev) =>
        (prev ?? []).filter((q) => q.id !== id),
      )
      if (offline) {
        const current = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []
        storage.saveQuotes(current)
      }
    },
  })
}
