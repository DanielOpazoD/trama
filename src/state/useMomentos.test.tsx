/**
 * BB5: tests del hook de Momentos. Antes la coverage era 13% (solo
 * imports). Acá validamos que las 3 mutaciones invocan la API correcta
 * y disparan invalidateQueries con la queryKey correcta.
 *
 * No testeamos el shape de listMomentos en sí — eso ya lo cubren los
 * endpoint tests con SQL mockeado. Acá nos enfocamos en el wiring
 * cliente: ¿la mutation llama al método de api? ¿el cache se invalida?
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAddMomento,
  useDeleteMomento,
  useUpdateMomento,
} from './useMomentos'
import * as apiModule from '../api'

const MOMENTOS_INFINITE = ['momentos', 'infinite'] as const

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

const FAKE_MOMENTO = {
  id: 'mom-1',
  kind: 'nota' as const,
  capturedAt: '2026-05-01T10:00:00Z',
  payload: { bodyText: 'una nota' },
  note: undefined,
  origin: { kind: 'manual' as const },
  entityIds: [],
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAddMomento', () => {
  it('llama api.createMomento con los datos pasados', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'createMomento')
      .mockResolvedValue(FAKE_MOMENTO)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useAddMomento(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({
        kind: 'nota',
        payload: { bodyText: 'una nota' },
      })
    })

    expect(spy).toHaveBeenCalledWith({
      kind: 'nota',
      payload: { bodyText: 'una nota' },
    })
  })

  it('invalida la query infinite tras éxito', async () => {
    vi.spyOn(apiModule.api, 'createMomento').mockResolvedValue(FAKE_MOMENTO)
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useAddMomento(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({
        kind: 'nota',
        payload: { bodyText: 'una nota' },
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MOMENTOS_INFINITE })
  })
})

describe('useUpdateMomento', () => {
  it('llama api.updateMomento con id + patch', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'updateMomento')
      .mockResolvedValue({ ...FAKE_MOMENTO, note: 'updated' })
    const qc = makeQueryClient()
    const { result } = renderHook(() => useUpdateMomento(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: 'mom-1', patch: { note: 'updated' } })
    })

    expect(spy).toHaveBeenCalledWith('mom-1', { note: 'updated' })
  })

  it('propaga errores como rejected mutation', async () => {
    vi.spyOn(apiModule.api, 'updateMomento').mockRejectedValue(
      new Error('boom'),
    )
    const qc = makeQueryClient()
    const { result } = renderHook(() => useUpdateMomento(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'x', patch: { note: 'y' } })
      } catch {
        // expected
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('boom')
  })
})

describe('useDeleteMomento', () => {
  it('llama api.deleteMomento con el id', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'deleteMomento')
      .mockResolvedValue({ deletedAt: '2026-05-01T11:00:00Z' })
    const qc = makeQueryClient()
    const { result } = renderHook(() => useDeleteMomento(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync('mom-99')
    })

    expect(spy).toHaveBeenCalledWith('mom-99')
  })

  it('invalida la query infinite tras éxito', async () => {
    vi.spyOn(apiModule.api, 'deleteMomento').mockResolvedValue({
      deletedAt: '2026-05-01T11:00:00Z',
    })
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteMomento(), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.mutateAsync('mom-99')
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MOMENTOS_INFINITE })
  })
})
