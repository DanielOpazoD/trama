import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type XBookmark, type XCronica } from '../api'
import { queryKeys } from './queryClient'
import {
  useClassifyBookmarks,
  useDeleteBookmark,
  useGenerateXCronica,
  useTwitterBookmarksQuery,
  useXCronicaQuery,
  useXStatusQuery,
} from './useTwitter'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrapWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const BOOKMARK: XBookmark = {
  id: 'x-bookmark-1',
  tweetId: 'tweet-1',
  text: 'Un hilo guardado',
  authorName: 'Alicia',
  authorUsername: 'alice',
  tweetCreatedAt: '2026-05-01T10:00:00Z',
  url: 'https://x.com/alice/status/1',
  capturedAt: '2026-05-01T10:01:00Z',
  topic: null,
}

const CRONICA: XCronica = {
  id: 'cronica-x-1',
  text: 'Una lectura de los bookmarks.',
  sourceCount: 3,
  generatedAt: '2026-05-01T12:00:00Z',
  provider: 'openai',
  model: 'gpt-test',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTwitter queries', () => {
  it('lee bookmarks con la query key de X', async () => {
    vi.spyOn(api, 'xBookmarks').mockResolvedValue({ items: [BOOKMARK] })
    const qc = makeQueryClient()

    const { result } = renderHook(() => useTwitterBookmarksQuery(), {
      wrapper: wrapWith(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ items: [BOOKMARK] })
    expect(qc.getQueryData(queryKeys.xBookmarks)).toEqual({ items: [BOOKMARK] })
  })

  it('lee estado de conexión y crónica desde sus keys dedicadas', async () => {
    vi.spyOn(api, 'xStatus').mockResolvedValue({
      connected: true,
      needsReconnect: false,
      username: 'alice',
      xUserId: 'x-1',
      lastSyncedAt: '2026-05-01T10:00:00Z',
      counts: { totalBookmarks: 1 },
    })
    vi.spyOn(api, 'xCronica').mockResolvedValue({ cronica: CRONICA })
    const qc = makeQueryClient()

    const status = renderHook(() => useXStatusQuery(), { wrapper: wrapWith(qc) })
    const cronica = renderHook(() => useXCronicaQuery(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(status.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(cronica.result.current.isSuccess).toBe(true))
    expect(qc.getQueryData(queryKeys.xStatus)).toMatchObject({ connected: true })
    expect(qc.getQueryData(queryKeys.xCronica)).toEqual({ cronica: CRONICA })
  })
})

describe('useTwitter mutations', () => {
  it('soft-deletea bookmark e invalida X, cronología e inicio', async () => {
    vi.spyOn(api, 'xDeleteBookmark').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteBookmark(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await result.current.mutateAsync('x-bookmark-1')
    })

    expect(api.xDeleteBookmark).toHaveBeenCalledWith('x-bookmark-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.x })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cronologiaInfinite })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.home })
  })

  it('clasifica bookmarks e invalida el prefijo X', async () => {
    vi.spyOn(api, 'xClassify').mockResolvedValue({ classified: 2, remaining: false })
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useClassifyBookmarks(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(api.xClassify).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.x })
  })

  it('genera crónica e invalida crónica, cronología e inicio', async () => {
    vi.spyOn(api, 'xGenerateCronica').mockResolvedValue({ cronica: CRONICA })
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useGenerateXCronica(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(api.xGenerateCronica).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.xCronica })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cronologiaInfinite })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.home })
  })
})
