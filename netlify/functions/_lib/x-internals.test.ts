import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBookmarks, XApiError } from './x/sync'

/**
 * E5 — `fetchBookmarks` valida la respuesta de la API v2 de X con Zod. Happy
 * path (normaliza data + includes) y shape rota del proveedor (falla ruidoso).
 */

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchBookmarks', () => {
  it('normaliza tweets cruzando author_id con includes.users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 't1', text: 'hola', created_at: '2026-05-01', author_id: 'a1' }],
          includes: { users: [{ id: 'a1', username: 'autor', name: 'Autor' }] },
        }),
      ),
    )

    const out = await fetchBookmarks('token-1', 'x-1')

    expect(out).toEqual([
      {
        tweetId: 't1',
        text: 'hola',
        authorId: 'a1',
        authorName: 'Autor',
        authorUsername: 'autor',
        createdAt: '2026-05-01',
        url: 'https://x.com/autor/status/t1',
      },
    ])
  })

  it('respuesta vacía (sin data) → []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({})),
    )
    expect(await fetchBookmarks('token-1', 'x-1')).toEqual([])
  })

  it('propaga XApiError con status + body cuando X responde con error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    )
    await expect(fetchBookmarks('token-1', 'x-1')).rejects.toBeInstanceOf(XApiError)
  })

  it('E5: falla ruidoso si un tweet llega sin id/text (200 OK, shape rota)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [{ text: 'sin id' }] })),
    )
    await expect(fetchBookmarks('token-1', 'x-1')).rejects.toThrow()
  })
})
