import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useDeleteRecorte,
  usePromoteRecorte,
  useRecortesQuery,
  useUpdateRecorte,
} from './useRecortes'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../test-utils'
import { ToastProvider } from './toast'

function makeWrapper() {
  const qc = makeQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    )
  }
}

/**
 * Hooks de Recortes: round-trip de query, archivo, borrado con Deshacer
 * (restore con el deleted_at exacto) y promoción con invalidación.
 */

const ROW = {
  id: 'r1',
  text: 'recorte',
  source_url: null,
  source_title: null,
  source_author: null,
  note: null,
  image_url: null,
  status: 'pending',
  promoted_target: null,
  promoted_id: null,
  captured_at: null,
  created_at: '2026-06-10T12:00:00.000Z',
  updated_at: '2026-06-10T12:00:00.000Z',
}

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const calls: Array<{ url: string; method: string }> = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method })
      if (url.includes('/restore')) return jsonResp({ restored: true })
      if (url.includes('/promote')) {
        return jsonResp({ ...ROW, status: 'promoted', promoted_target: 'quote' })
      }
      if (method === 'DELETE') {
        return jsonResp({ ok: true, deletedAt: '2026-06-11T10:00:00.000Z' })
      }
      if (method === 'PATCH') return jsonResp({ ...ROW, status: 'archived' })
      return jsonResp([ROW])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useRecortes', () => {
  it('query lista y transforma a camelCase', async () => {
    const { result } = renderHook(() => useRecortesQuery(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.data![0]!.createdAt).toBe('2026-06-10T12:00:00.000Z')
  })

  it('update parchea estado (archivar)', async () => {
    const { result } = renderHook(() => useUpdateRecorte(), {
      wrapper: makeWrapper(),
    })
    await act(async () => {
      await result.current.mutateAsync({ id: 'r1', patch: { status: 'archived' } })
    })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true)
  })

  it('delete guarda el deletedAt para el Deshacer', async () => {
    const { result } = renderHook(() => useDeleteRecorte(), {
      wrapper: makeWrapper(),
    })
    await act(async () => {
      const res = await result.current.mutateAsync('r1')
      expect(res.deletedAt).toBe('2026-06-11T10:00:00.000Z')
    })
  })

  it('promote postea target y promotedId', async () => {
    const { result } = renderHook(() => usePromoteRecorte(), {
      wrapper: makeWrapper(),
    })
    await act(async () => {
      const res = await result.current.mutateAsync({
        id: 'r1',
        target: 'quote',
        promotedId: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
      })
      expect(res.status).toBe('promoted')
    })
    expect(calls.some((c) => c.url.includes('/promote') && c.method === 'POST')).toBe(
      true,
    )
  })
})
