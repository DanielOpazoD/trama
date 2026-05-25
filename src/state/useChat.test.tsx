/**
 * BB5+: cierre del gap de P1. useChat tenía 6% coverage (todo lo demás
 * del state/ ya está). Cubrimos las partes NO-SSE (queries + mutations
 * simples). El streaming `useSendChatMessage` requiere mockear el
 * generator de chunks de api.streamChatMessage; lo dejamos para una
 * iteración futura cuando haya un test e2e o setup más completo.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import {
  useChatMessagesQuery,
  useChatThreadsQuery,
  useCreateChatThread,
  useDeleteChatThread,
} from './useChat'
import * as apiModule from '../api'

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
          {children}
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

const THREAD_A = {
  id: 'th-1',
  title: 'Sobre Camus',
  context: 'citas',
  createdAt: '2026-05-20T10:00:00Z',
  updatedAt: '2026-05-20T10:00:00Z',
  messageCount: 4,
}

const THREAD_B = {
  id: 'th-2',
  title: null,
  context: null,
  createdAt: '2026-05-21T10:00:00Z',
  updatedAt: '2026-05-21T10:00:00Z',
  messageCount: 1,
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useChatThreadsQuery', () => {
  it('lista hilos cuando online', async () => {
    vi.spyOn(apiModule.api, 'listChatThreads').mockResolvedValue([
      THREAD_A,
      THREAD_B,
    ])
    const qc = makeQueryClient()
    const { result } = renderHook(() => useChatThreadsQuery(), {
      wrapper: wrapWith(qc),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].id).toBe('th-1')
  })

  it('no fetcha cuando offline', async () => {
    const spy = vi.spyOn(apiModule.api, 'listChatThreads').mockResolvedValue([])
    const qc = makeQueryClient()
    renderHook(() => useChatThreadsQuery(), {
      wrapper: wrapWith(qc, true),
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useCreateChatThread', () => {
  it('llama api.createChatThread con string title', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'createChatThread')
      .mockResolvedValue(THREAD_A)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useCreateChatThread(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync('Sobre Camus')
    })
    expect(spy).toHaveBeenCalledWith('Sobre Camus')
  })

  it('llama api.createChatThread con opts { context }', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'createChatThread')
      .mockResolvedValue(THREAD_A)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useCreateChatThread(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({ context: 'citas' })
    })
    expect(spy).toHaveBeenCalledWith({ context: 'citas' })
  })

  it('prepende el thread creado al cache', async () => {
    vi.spyOn(apiModule.api, 'createChatThread').mockResolvedValue(THREAD_B)
    const qc = makeQueryClient()
    qc.setQueryData(['chat', 'threads'], [THREAD_A])
    const { result } = renderHook(() => useCreateChatThread(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(undefined)
    })

    const cached = qc.getQueryData<typeof THREAD_A[]>(['chat', 'threads'])
    expect(cached).toHaveLength(2)
    expect(cached![0].id).toBe('th-2') // prepended
    expect(cached![1].id).toBe('th-1')
  })
})

describe('useDeleteChatThread', () => {
  it('filtra el thread eliminado del cache', async () => {
    vi.spyOn(apiModule.api, 'deleteChatThread').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    qc.setQueryData(['chat', 'threads'], [THREAD_A, THREAD_B])
    const { result } = renderHook(() => useDeleteChatThread(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync('th-1')
    })

    const cached = qc.getQueryData<typeof THREAD_A[]>(['chat', 'threads'])
    expect(cached).toHaveLength(1)
    expect(cached![0].id).toBe('th-2')
  })

  it('elimina la cache de mensajes del thread borrado', async () => {
    vi.spyOn(apiModule.api, 'deleteChatThread').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    qc.setQueryData(['chat', 'threads'], [THREAD_A])
    qc.setQueryData(['chat', 'messages', 'th-1'], [
      { id: 'm1', role: 'user', content: 'hola', proposal: null, createdAt: '' },
    ])
    const removeSpy = vi.spyOn(qc, 'removeQueries')

    const { result } = renderHook(() => useDeleteChatThread(), {
      wrapper: wrapWith(qc),
    })
    await act(async () => {
      await result.current.mutateAsync('th-1')
    })

    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: ['chat', 'messages', 'th-1'],
    })
  })
})

describe('useChatMessagesQuery', () => {
  it('lista mensajes cuando threadId está presente', async () => {
    const msgs = [
      {
        id: 'm1',
        role: 'user' as const,
        content: 'hola',
        proposal: null,
        createdAt: '2026-05-25T10:00:00Z',
      },
      {
        id: 'm2',
        role: 'assistant' as const,
        content: 'cómo va',
        proposal: null,
        createdAt: '2026-05-25T10:00:30Z',
      },
    ]
    vi.spyOn(apiModule.api, 'listChatMessages').mockResolvedValue(msgs)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useChatMessagesQuery('th-1'), {
      wrapper: wrapWith(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(msgs)
  })

  it('está deshabilitada cuando threadId es null', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'listChatMessages')
      .mockResolvedValue([])
    const qc = makeQueryClient()
    renderHook(() => useChatMessagesQuery(null), {
      wrapper: wrapWith(qc),
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(spy).not.toHaveBeenCalled()
  })
})
