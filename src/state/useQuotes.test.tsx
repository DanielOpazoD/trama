/**
 * Tests del hook de Citas. Cubre el insert optimistic (BB4) y delete
 * con cascade. Patrón espejo de useRelationships.test.tsx.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { ToastProvider } from './toast'
import { queryKeys } from './queryClient'
import { useAddQuote, useDeleteQuote } from './useQuotes'
import * as apiModule from '../api'
import type { Quote } from '../types'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrapWith(qc: QueryClient, offline = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

const REAL_QUOTE: Quote = {
  id: 'q-real',
  entityId: 'ent-A',
  text: 'una cita',
  source: undefined,
  context: undefined,
  origin: { kind: 'manual' },
  linkedQuoteIds: [],
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
} as Quote

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('useAddQuote — optimistic', () => {
  it('inserta una cita temporal antes del response', async () => {
    let resolveServer: (q: Quote) => void = () => {}
    const serverPromise = new Promise<Quote>((r) => (resolveServer = r))
    vi.spyOn(apiModule.api, 'createQuote').mockReturnValue(serverPromise)

    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])

    const { result } = renderHook(() => useAddQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ entityId: 'ent-A', text: 'una cita' })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list).toHaveLength(1)
      expect(list[0]!.id).toMatch(/^__optimistic_/)
      expect(list[0]!.text).toBe('una cita')
    })

    act(() => resolveServer(REAL_QUOTE))
    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list).toHaveLength(1)
      expect(list[0]!.id).toBe('q-real')
    })
  })

  it('rollback si el server rechaza', async () => {
    const previous: Quote[] = [REAL_QUOTE]
    vi.spyOn(apiModule.api, 'createQuote').mockRejectedValue(new Error('500'))

    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, previous)

    const { result } = renderHook(() => useAddQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ entityId: 'ent-B', text: 'rota' })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list).toEqual(previous)
    })
  })
})

describe('useDeleteQuote', () => {
  it('borra la cita del cache al confirmar el server', async () => {
    vi.spyOn(apiModule.api, 'deleteQuote').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteQuote>>)

    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [
      REAL_QUOTE,
      { ...REAL_QUOTE, id: 'q-other' } as Quote,
    ])

    const { result } = renderHook(() => useDeleteQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate('q-real')
    })

    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list).toHaveLength(1)
      expect(list[0]!.id).toBe('q-other')
    })
  })
})
