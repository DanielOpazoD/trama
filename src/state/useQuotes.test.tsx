/**
 * Tests del hook de Citas. Cubre el insert optimistic (BB4) y delete
 * con cascade. Patrón espejo de useRelationships.test.tsx.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { ToastProvider, useToast } from './toast'
import { queryKeys } from './queryClient'
import { useAddQuote, useQuotesQuery, useUpdateQuote, useDeleteQuote } from './useQuotes'
import * as apiModule from '../api'
import * as demoModule from '../lib/demo'
import { storage } from '../storage'
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

function invalidatedKeys(qc: QueryClient) {
  const spy = vi
    .spyOn(qc, 'invalidateQueries')
    .mockImplementation(() => Promise.resolve(undefined))
  return {
    spy,
    keys: () => spy.mock.calls.map(([filters]) => filters?.queryKey),
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

  it('muestra el toast "Deshacer" y al accionarlo restaura la cita', async () => {
    vi.spyOn(apiModule.api, 'deleteQuote').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteQuote>>)
    const restoreSpy = vi
      .spyOn(apiModule.api, 'restoreQuote')
      .mockResolvedValue(undefined)

    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])

    const { result } = renderHook(() => ({ del: useDeleteQuote(), toast: useToast() }), {
      wrapper: wrapWith(qc),
    })
    act(() => {
      result.current.del.mutate('q-real')
    })

    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    expect(result.current.toast.current!.action?.label).toBe('Deshacer')

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    expect(restoreSpy).toHaveBeenCalledWith('q-real', '2026-05-28T00:00:00Z')
  })

  it('no muestra toast cuando el delete es silent', async () => {
    vi.spyOn(apiModule.api, 'deleteQuote').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteQuote>>)

    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])

    const { result } = renderHook(() => ({ del: useDeleteQuote(), toast: useToast() }), {
      wrapper: wrapWith(qc),
    })
    act(() => {
      result.current.del.mutate({ id: 'q-real', silent: true })
    })

    await waitFor(() => expect(result.current.del.isSuccess).toBe(true))
    expect(result.current.toast.current).toBeNull()
  })
})

describe('useUpdateQuote — optimistic patch', () => {
  it('useQuotesQuery no devuelve localStorage ante error API fuera de modo demo', async () => {
    vi.spyOn(apiModule.api, 'listQuotes').mockRejectedValue(new Error('server down'))
    vi.spyOn(demoModule, 'isDemoMode').mockReturnValue(false)
    const loadSpy = vi.spyOn(storage, 'loadQuotes')
    const qc = makeQueryClient()

    const { result } = renderHook(() => useQuotesQuery(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('useQuotesQuery permite localStorage solo en modo demo explícito', async () => {
    vi.spyOn(apiModule.api, 'listQuotes').mockRejectedValue(
      new Error('demo backend miss'),
    )
    vi.spyOn(demoModule, 'isDemoMode').mockReturnValue(true)
    vi.spyOn(storage, 'loadQuotes').mockReturnValue([REAL_QUOTE])
    const qc = makeQueryClient()

    const { result } = renderHook(() => useQuotesQuery(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([REAL_QUOTE])
  })

  it('aplica el patch en cache al instante; reemplaza por el real en éxito', async () => {
    let resolveServer: (q: Quote) => void = () => {}
    const serverPromise = new Promise<Quote>((r) => (resolveServer = r))
    vi.spyOn(apiModule.api, 'updateQuote').mockReturnValue(serverPromise)

    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])

    const { result } = renderHook(() => useUpdateQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'q-real', patch: { text: 'cita editada' } })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list[0]!.text).toBe('cita editada')
    })

    act(() => resolveServer({ ...REAL_QUOTE, text: 'cita editada' } as Quote))
    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list[0]!.text).toBe('cita editada')
    })
  })

  it('rollback si el server rechaza el update', async () => {
    vi.spyOn(apiModule.api, 'updateQuote').mockRejectedValue(new Error('fail'))
    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])

    const { result } = renderHook(() => useUpdateQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'q-real', patch: { text: 'X' } })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      expect(list[0]!.text).toBe('una cita') // rollback al original
    })
  })

  it('rechaza pidiendo conexión cuando offline (no llama al server)', async () => {
    const updateSpy = vi.spyOn(apiModule.api, 'updateQuote')
    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])

    const { result } = renderHook(() => useUpdateQuote(), { wrapper: wrapWith(qc, true) })
    act(() => {
      result.current.mutate({ id: 'q-real', patch: { text: 'X' } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/conexión/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('invalidación de queries', () => {
  it('useAddQuote invalida quotes infinite, counts, refs y home', async () => {
    vi.spyOn(apiModule.api, 'createQuote').mockResolvedValue(REAL_QUOTE)
    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    const invalidations = invalidatedKeys(qc)

    const { result } = renderHook(() => useAddQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ entityId: 'ent-A', text: 'una cita' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidations.keys()).toEqual([
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.home,
    ])
  })

  it('useUpdateQuote invalida quotes infinite y home', async () => {
    vi.spyOn(apiModule.api, 'updateQuote').mockResolvedValue({
      ...REAL_QUOTE,
      text: 'cita editada',
    } as Quote)
    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])
    const invalidations = invalidatedKeys(qc)

    const { result } = renderHook(() => useUpdateQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'q-real', patch: { text: 'cita editada' } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidations.keys()).toEqual([queryKeys.quotesInfinite, queryKeys.home])
  })

  it('useDeleteQuote invalida quotes infinite, counts, refs y home', async () => {
    vi.spyOn(apiModule.api, 'deleteQuote').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteQuote>>)
    const qc = makeQueryClient()
    qc.setQueryData<Quote[]>(queryKeys.quotes, [REAL_QUOTE])
    const invalidations = invalidatedKeys(qc)

    const { result } = renderHook(() => useDeleteQuote(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'q-real', silent: true })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidations.keys()).toEqual([
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.home,
    ])
  })
})
