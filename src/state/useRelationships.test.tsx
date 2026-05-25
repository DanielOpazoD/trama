/**
 * BB5: tests del hook de Relaciones. Especialmente importante validar
 * el optimistic insert de BB4: el row temporal aparece en cache antes
 * de que la API responda, y se reemplaza por el real al volver. Si la
 * API rechaza, rollback al snapshot.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { ToastProvider } from './toast'
import { queryKeys } from './queryClient'
import {
  useAddRelationship,
  useUpdateRelationship,
} from './useRelationships'
import * as apiModule from '../api'
import type { Relationship } from '../types'

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

const REAL_RELATIONSHIP: Relationship = {
  id: 'rel-real',
  fromId: 'ent-A',
  toId: 'ent-B',
  type: 'influye_en',
  notes: undefined,
  origin: { kind: 'manual' },
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAddRelationship — optimistic', () => {
  it('inserta un row temporal en cache antes del response', async () => {
    // Diferimos la resolución del API para inspeccionar el estado intermedio.
    let resolveServer: (r: Relationship) => void = () => {}
    const serverPromise = new Promise<Relationship>((resolve) => {
      resolveServer = resolve
    })
    vi.spyOn(apiModule.api, 'createRelationship').mockReturnValue(serverPromise)

    const qc = makeQueryClient()
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapWith(qc),
    })

    act(() => {
      result.current.mutate({
        fromId: 'ent-A',
        toId: 'ent-B',
        type: 'influye_en',
      })
    })

    // Mientras el server no respondió, ya debe haber un row con prefijo
    // __optimistic_ en cache.
    await waitFor(() => {
      const cached = qc.getQueryData<Relationship[]>(queryKeys.relationships)
      expect(cached).toBeDefined()
      expect(cached!.length).toBe(1)
      expect(cached![0].id.startsWith('__optimistic_')).toBe(true)
    })

    // Server responde y el optimistic se reemplaza por el real.
    resolveServer(REAL_RELATIONSHIP)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const final = qc.getQueryData<Relationship[]>(queryKeys.relationships)
    expect(final).toEqual([REAL_RELATIONSHIP])
    expect(final![0].id).toBe('rel-real')
  })

  it('hace rollback en error', async () => {
    const initial: Relationship[] = [
      {
        ...REAL_RELATIONSHIP,
        id: 'rel-prev',
      },
    ]
    vi.spyOn(apiModule.api, 'createRelationship').mockRejectedValue(
      new Error('server reject'),
    )
    const qc = makeQueryClient()
    qc.setQueryData<Relationship[]>(queryKeys.relationships, initial)

    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapWith(qc),
    })

    act(() => {
      result.current.mutate({
        fromId: 'ent-A',
        toId: 'ent-B',
        type: 'influye_en',
      })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // El cache vuelve exactamente al estado anterior.
    const after = qc.getQueryData<Relationship[]>(queryKeys.relationships)
    expect(after).toEqual(initial)
  })
})

describe('useUpdateRelationship — optimistic', () => {
  it('aplica el patch en cache antes del response', async () => {
    const original: Relationship = {
      ...REAL_RELATIONSHIP,
      id: 'rel-1',
      notes: 'antes',
    }
    let resolveServer: (r: Relationship) => void = () => {}
    const serverPromise = new Promise<Relationship>((resolve) => {
      resolveServer = resolve
    })
    vi.spyOn(apiModule.api, 'updateRelationship').mockReturnValue(serverPromise)

    const qc = makeQueryClient()
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [original])

    const { result } = renderHook(() => useUpdateRelationship(), {
      wrapper: wrapWith(qc),
    })

    act(() => {
      result.current.mutate({ id: 'rel-1', patch: { notes: 'después' } })
    })

    await waitFor(() => {
      const cached = qc.getQueryData<Relationship[]>(queryKeys.relationships)
      expect(cached![0].notes).toBe('después')
    })

    resolveServer({ ...original, notes: 'después' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('hace rollback en error', async () => {
    const original: Relationship = {
      ...REAL_RELATIONSHIP,
      id: 'rel-1',
      notes: 'original',
    }
    vi.spyOn(apiModule.api, 'updateRelationship').mockRejectedValue(
      new Error('500'),
    )
    const qc = makeQueryClient()
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [original])

    const { result } = renderHook(() => useUpdateRelationship(), {
      wrapper: wrapWith(qc),
    })

    act(() => {
      result.current.mutate({ id: 'rel-1', patch: { notes: 'cambio' } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const after = qc.getQueryData<Relationship[]>(queryKeys.relationships)
    expect(after![0].notes).toBe('original')
  })
})
