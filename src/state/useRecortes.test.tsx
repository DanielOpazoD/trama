import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useCreateRecorte,
  useDeleteRecorte,
  usePromoteRecorte,
  useUnpromoteRecorte,
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

const calls: Array<{ url: string; method: string; body?: unknown }> = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })
      if (url.includes('/restore')) return jsonResp({ restored: true })
      if (url.includes('/unpromote')) {
        return jsonResp({ ...ROW, status: 'pending', promoted_target: null })
      }
      if (url.includes('/promote')) {
        return jsonResp({ ...ROW, status: 'promoted', promoted_target: 'quote' })
      }
      if (url.includes('recortes-image-upload')) {
        return jsonResp({ imageKey: 'user-1/abc.webp', mime: 'image/webp', size: 10 })
      }
      if (url.includes('momentos-url-preview')) {
        return jsonResp({
          url: 'https://example.com/x',
          title: 'Título OG',
          description: 'Descripción OG',
          source: 'example.com',
          author: 'Autora OG',
          image: 'https://example.com/img.jpg',
          fetched: true,
        })
      }
      if (method === 'DELETE') {
        return jsonResp({ ok: true, deletedAt: '2026-06-11T10:00:00.000Z' })
      }
      if (method === 'PATCH') return jsonResp({ ...ROW, status: 'archived' })
      // POST a /api/recortes (create) devuelve una fila única, no un arreglo.
      if (method === 'POST' && url.endsWith('/api/recortes')) return jsonResp(ROW)
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

  it('captura un enlace y lo enriquece con metadatos OG (título, autor, imagen)', async () => {
    const { result } = renderHook(() => useCreateRecorte(), { wrapper: makeWrapper() })
    await act(async () => {
      await result.current.mutateAsync({ kind: 'link', url: 'https://example.com/x' })
    })
    expect(calls.some((c) => c.url.includes('momentos-url-preview'))).toBe(true)
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/recortes'))
    expect(post?.body).toMatchObject({
      text: 'Descripción OG',
      sourceUrl: 'https://example.com/x',
      sourceTitle: 'Título OG',
      sourceAuthor: 'Autora OG',
      imageUrl: 'https://example.com/img.jpg',
      captureMode: 'html',
    })
  })

  it('captura una imagen: la sube y crea un recorte de imagen con la imageKey', async () => {
    const file = new File(['x'], 'shot.webp', { type: 'image/webp' })
    const { result } = renderHook(() => useCreateRecorte(), { wrapper: makeWrapper() })
    await act(async () => {
      await result.current.mutateAsync({ kind: 'image', file })
    })
    expect(calls.some((c) => c.url.includes('recortes-image-upload'))).toBe(true)
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/recortes'))
    expect(post?.body).toMatchObject({
      imageKey: 'user-1/abc.webp',
      captureMode: 'image',
    })
  })

  it('unpromote revierte: postea a /unpromote y devuelve el recorte a pending', async () => {
    const { result } = renderHook(() => useUnpromoteRecorte(), { wrapper: makeWrapper() })
    await act(async () => {
      const res = await result.current.mutateAsync('r1')
      expect(res.status).toBe('pending')
      expect(res.promotedTarget).toBeNull()
    })
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/unpromote'))).toBe(
      true,
    )
  })

  it('promote postea el payload del destino para creación server-side', async () => {
    const { result } = renderHook(() => usePromoteRecorte(), {
      wrapper: makeWrapper(),
    })
    await act(async () => {
      const res = await result.current.mutateAsync({
        id: 'r1',
        input: {
          target: 'quote',
          quote: {
            entityId: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
            text: 'recorte',
          },
        },
      })
      expect(res.status).toBe('promoted')
    })
    const promote = calls.find((c) => c.url.includes('/promote') && c.method === 'POST')
    expect(promote?.body).toEqual({
      target: 'quote',
      quote: {
        entityId: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
        text: 'recorte',
      },
    })
  })
})
