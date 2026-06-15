import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

/**
 * Caché de miniaturas de recortes-enlace (`recortes-thumbnail-cache`): el
 * servidor descarga la miniatura (og:image o derivada de YouTube) con el fetch
 * SSRF-safe y la guarda en el blob propio `recortes-media`, PATCHeando el
 * recorte con la `image_key`. Verifica los guards: idempotencia (ya cacheado),
 * ownership/soft-delete (404), rechazo de no-imagen y de oversize, y el camino
 * feliz YouTube/og:image.
 */

vi.mock('./db.js', () => setupMockSql())

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
}))
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({ set: blobMocks.set })),
}))

const ssrfMocks = vi.hoisted(() => ({
  safeFetchFollowingRedirects: vi.fn(),
}))
vi.mock('./ssrf-fetch.js', () => ({
  safeFetchFollowingRedirects: ssrfMocks.safeFetchFollowingRedirects,
}))

import handler from '../recortes-thumbnail-cache'

function imageResponse(bytes: Uint8Array, contentType = 'image/jpeg') {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

function post(id = 'r1') {
  return handler(
    new Request(`http://localhost/api/recortes/${id}/cache-thumbnail`, {
      method: 'POST',
    }),
    mockContext({ id }),
  )
}

beforeEach(() => {
  mockSqlResponses.reset()
  blobMocks.set.mockClear()
  ssrfMocks.safeFetchFollowingRedirects.mockReset()
})

describe('recortes-thumbnail-cache', () => {
  it('rechaza métodos no POST', async () => {
    const res = await handler(
      new Request('http://localhost/api/recortes/r1/cache-thumbnail'),
      mockContext({ id: 'r1' }),
    )
    expect(res.status).toBe(405)
  })

  it('404 si el recorte no es del usuario o está soft-deleteado', async () => {
    mockSqlResponses.push([]) // SELECT no devuelve fila
    const res = await post()
    expect(res.status).toBe(404)
    expect(ssrfMocks.safeFetchFollowingRedirects).not.toHaveBeenCalled()
  })

  it('idempotente: no re-descarga si ya tiene image_key', async () => {
    mockSqlResponses.push([
      {
        source_url: 'https://youtu.be/dQw4w9WgXcQ',
        image_url: null,
        image_key: 'u/x.jpg',
      },
    ])
    const res = await post()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      cached: false,
      reason: 'already-cached',
    })
    expect(ssrfMocks.safeFetchFollowingRedirects).not.toHaveBeenCalled()
    expect(blobMocks.set).not.toHaveBeenCalled()
  })

  it('no-thumbnail: source no-YouTube sin og:image → no descarga', async () => {
    mockSqlResponses.push([
      { source_url: 'https://example.com/articulo', image_url: null, image_key: null },
    ])
    const res = await post()
    await expect(res.json()).resolves.toMatchObject({
      cached: false,
      reason: 'no-thumbnail',
    })
    expect(ssrfMocks.safeFetchFollowingRedirects).not.toHaveBeenCalled()
  })

  it('rechaza content-type que no es imagen (no guarda blob)', async () => {
    mockSqlResponses.push([
      { source_url: 'https://youtu.be/dQw4w9WgXcQ', image_url: null, image_key: null },
    ])
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    const res = await post()
    await expect(res.json()).resolves.toMatchObject({
      cached: false,
      reason: 'download-failed',
    })
    expect(blobMocks.set).not.toHaveBeenCalled()
  })

  it('rechaza imágenes que superan el tope de tamaño (Content-Length)', async () => {
    mockSqlResponses.push([
      { source_url: 'https://youtu.be/dQw4w9WgXcQ', image_url: null, image_key: null },
    ])
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(6 * 1024 * 1024),
        },
      }),
    )
    const res = await post()
    await expect(res.json()).resolves.toMatchObject({
      cached: false,
      reason: 'download-failed',
    })
    expect(blobMocks.set).not.toHaveBeenCalled()
  })

  it('camino feliz YouTube: descarga, guarda blob y PATCHea image_key', async () => {
    mockSqlResponses.push(
      [{ source_url: 'https://youtu.be/dQw4w9WgXcQ', image_url: null, image_key: null }], // SELECT
      [{ image_key: 'legacy-single-user/abc.jpg' }], // UPDATE RETURNING
    )
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      imageResponse(new Uint8Array([1, 2, 3, 4])),
    )
    const res = await post()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cached).toBe(true)
    expect(body.imageKey).toMatch(/^legacy-single-user\/[a-f0-9]{32}\.jpg$/)
    // Descargó la miniatura derivada de YouTube, no el og:image.
    const [downloadedUrl] = ssrfMocks.safeFetchFollowingRedirects.mock.calls[0]!
    expect(String(downloadedUrl)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(blobMocks.set).toHaveBeenCalledOnce()
  })

  it('camino feliz og:image: usa la image_url del enriquecimiento OG', async () => {
    mockSqlResponses.push(
      [
        {
          source_url: 'https://example.com/articulo',
          image_url: 'https://cdn.example.com/og.png',
          image_key: null,
        },
      ],
      [{ image_key: 'legacy-single-user/def.png' }],
    )
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      imageResponse(new Uint8Array([9, 9]), 'image/png'),
    )
    const res = await post()
    const body = await res.json()
    expect(body.cached).toBe(true)
    const [downloadedUrl, , accept] = ssrfMocks.safeFetchFollowingRedirects.mock.calls[0]!
    expect(String(downloadedUrl)).toBe('https://cdn.example.com/og.png')
    expect(accept).toBe('image/*')
  })

  it('carrera: si el UPDATE no toca filas (otra pestaña cacheó), cached:false', async () => {
    mockSqlResponses.push(
      [{ source_url: 'https://youtu.be/dQw4w9WgXcQ', image_url: null, image_key: null }],
      [], // UPDATE no devuelve filas (image_key dejó de ser NULL)
    )
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      imageResponse(new Uint8Array([1, 2, 3])),
    )
    const res = await post()
    await expect(res.json()).resolves.toMatchObject({
      cached: false,
      reason: 'patch-skipped',
    })
  })
})
