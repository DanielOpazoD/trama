/**
 * BB5: tests del export/import. Especialmente importante el nuevo
 * shape ImportResult con `{ imported, skipped, failed[] }` (BB1) —
 * antes era solo `number` y los fallos se silenciaban.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { useExport, useImport } from './useExportImport'
import * as apiModule from '../api'
import type { ExportPayload } from '../types'

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

const SAMPLE: ExportPayload = {
  version: 1,
  exportedAt: '2026-05-25T12:00:00Z',
  entities: [],
  relationships: [],
  quotes: [],
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useExport', () => {
  it('llama api.exportAll cuando online', async () => {
    const spy = vi.spyOn(apiModule.api, 'exportAll').mockResolvedValue(SAMPLE)
    const qc = makeQueryClient()
    const { result } = renderHook(() => useExport(), { wrapper: wrapWith(qc) })

    await act(async () => {
      const out = await result.current()
      expect(out).toEqual(SAMPLE)
    })
    expect(spy).toHaveBeenCalled()
  })
})

describe('useImport', () => {
  it('propaga el ImportResult completo (no solo imported)', async () => {
    vi.spyOn(apiModule.api, 'importAll').mockResolvedValue({
      imported: 140,
      skipped: 5,
      failed: [
        { kind: 'entity', id: 'e1', reason: 'duplicate key' },
        { kind: 'quote', id: 'q1', reason: 'fk violation' },
      ],
    })
    const qc = makeQueryClient()
    const { result } = renderHook(() => useImport(), { wrapper: wrapWith(qc) })

    let importResult: Awaited<ReturnType<ReturnType<typeof useImport>>> | null = null
    await act(async () => {
      importResult = await result.current(SAMPLE)
    })

    expect(importResult).not.toBeNull()
    expect(importResult!.imported).toBe(140)
    expect(importResult!.skipped).toBe(5)
    expect(importResult!.failed).toHaveLength(2)
    expect(importResult!.failed![0]!.kind).toBe('entity')
  })

  it('devuelve failed[] vacío cuando todo importa OK', async () => {
    vi.spyOn(apiModule.api, 'importAll').mockResolvedValue({
      imported: 10,
      skipped: 0,
      failed: [],
    })
    const qc = makeQueryClient()
    const { result } = renderHook(() => useImport(), { wrapper: wrapWith(qc) })

    let importResult: Awaited<ReturnType<ReturnType<typeof useImport>>> | null = null
    await act(async () => {
      importResult = await result.current(SAMPLE)
    })

    expect(importResult!.imported).toBe(10)
    expect(importResult!.failed).toEqual([])
  })

  it('invalida queries de entities/quotes/relationships tras éxito', async () => {
    vi.spyOn(apiModule.api, 'importAll').mockResolvedValue({
      imported: 5,
      skipped: 0,
      failed: [],
    })
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useImport(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await result.current(SAMPLE)
    })

    // Espera a que las invalidaciones (Promise.all) se hayan completado.
    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map((c) => c[0])
      // entities, relationships, quotes
      expect(calls.length).toBeGreaterThanOrEqual(3)
    })
  })
})
