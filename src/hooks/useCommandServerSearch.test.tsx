import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse } from '../api'
import { useCommandServerSearch } from './useCommandServerSearch'

function response(id: string): SearchResponse {
  return {
    entities: [
      {
        id,
        name: id,
        type: 'persona',
        description: null,
        year: null,
        score: 1,
        lexical: 1,
        semantic: 0,
      },
    ],
    quotes: [],
    momentos: [],
    cronicas: [],
    chat: [],
    mode: 'lexical' as const,
  }
}

describe('useCommandServerSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('no consulta servidor con palette cerrado o query menor a dos caracteres', () => {
    const search = vi.fn()
    renderHook(() => useCommandServerSearch({ open: false, query: 'bo', search }))
    renderHook(() => useCommandServerSearch({ open: true, query: 'b', search }))

    act(() => vi.advanceTimersByTime(500))

    expect(search).not.toHaveBeenCalled()
  })

  it('debouncea la búsqueda lexical y expone estado searching estable', async () => {
    const search = vi.fn(async () => response('borges'))
    const { result } = renderHook(() =>
      useCommandServerSearch({ open: true, query: 'borges', search, debounceMs: 180 }),
    )

    expect(result.current.searching).toBe(false)
    expect(search).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(180)
      await Promise.resolve()
    })

    expect(search).toHaveBeenCalledWith('borges', { limit: 8, mode: 'lexical' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.searching).toBe(false)
    expect(result.current.serverResults?.entities[0]?.id).toBe('borges')
  })

  it('limpia resultados remotos al iniciar una nueva query válida', async () => {
    let resolveSecond: ((value: ReturnType<typeof response>) => void) | undefined
    const search = vi
      .fn()
      .mockResolvedValueOnce(response('borges'))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)))

    const { result, rerender } = renderHook(
      ({ query }) =>
        useCommandServerSearch({ open: true, query, search, debounceMs: 10 }),
      { initialProps: { query: 'borges' } },
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
      await Promise.resolve()
    })
    expect(result.current.serverResults?.entities[0]?.id).toBe('borges')

    rerender({ query: 'cortazar' })

    expect(result.current.serverResults).toBeNull()
    expect(result.current.searching).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(10)
      await Promise.resolve()
    })
    expect(result.current.searching).toBe(true)

    await act(async () => {
      resolveSecond?.(response('cortazar'))
      await Promise.resolve()
    })
    expect(result.current.searching).toBe(false)
    expect(result.current.serverResults?.entities[0]?.id).toBe('cortazar')
  })

  it('ignora respuestas viejas cuando cambia la query antes de resolver', async () => {
    let resolveFirst: ((value: ReturnType<typeof response>) => void) | undefined
    let resolveSecond: ((value: ReturnType<typeof response>) => void) | undefined
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)))

    const { result, rerender } = renderHook(
      ({ query }) =>
        useCommandServerSearch({ open: true, query, search, debounceMs: 10 }),
      { initialProps: { query: 'borges' } },
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
      await Promise.resolve()
    })
    rerender({ query: 'cortazar' })
    await act(async () => {
      vi.advanceTimersByTime(10)
      await Promise.resolve()
    })

    await act(async () => {
      resolveFirst?.(response('stale'))
      await Promise.resolve()
    })
    expect(result.current.serverResults).toBeNull()

    await act(async () => {
      resolveSecond?.(response('fresh'))
      await Promise.resolve()
    })
    expect(result.current.serverResults?.entities[0]?.id).toBe('fresh')
  })
})
