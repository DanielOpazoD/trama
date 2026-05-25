/**
 * BB5: el hook era 22% coverage. Test corto: llama al endpoint cuando
 * online, no llama cuando offline (porque el sidebar tiene fallback).
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { useCountsQuery } from './useCounts'
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

const COUNTS = {
  entities: 42,
  quotes: 128,
  relationships: 73,
  momentos: 15,
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCountsQuery', () => {
  it('llama api.getCounts y devuelve los counts cuando online', async () => {
    const spy = vi.spyOn(apiModule.api, 'getCounts').mockResolvedValue(COUNTS)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useCountsQuery(), {
      wrapper: wrapWith(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(COUNTS)
    expect(spy).toHaveBeenCalled()
  })

  it('no llama al endpoint cuando offline', async () => {
    const spy = vi.spyOn(apiModule.api, 'getCounts').mockResolvedValue(COUNTS)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useCountsQuery(), {
      wrapper: wrapWith(qc, true),
    })

    // En offline `enabled: false` — la query queda pending sin disparar
    // fetch. Esperamos un poco para que cualquier microtask se ejecute.
    await new Promise((r) => setTimeout(r, 30))
    expect(spy).not.toHaveBeenCalled()
    expect(result.current.isFetching).toBe(false)
  })
})
