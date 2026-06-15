import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lógica pura/aislada de la caché de miniaturas: qué URL se elige (YouTube vs
 * og:image), normalización del content-type, y el cap de tamaño en streaming
 * (cuando el server no declara Content-Length pero el body se pasa del tope).
 */

const ssrfMocks = vi.hoisted(() => ({
  safeFetchFollowingRedirects: vi.fn(),
}))
vi.mock('./ssrf-fetch.js', () => ({
  safeFetchFollowingRedirects: ssrfMocks.safeFetchFollowingRedirects,
}))

import {
  downloadThumbnail,
  imageMimeFromContentType,
  resolveThumbnailUrl,
} from './recortes-thumbnail'

beforeEach(() => {
  ssrfMocks.safeFetchFollowingRedirects.mockReset()
})

describe('resolveThumbnailUrl', () => {
  it('prioriza la miniatura derivada de YouTube sobre el og:image', () => {
    expect(
      resolveThumbnailUrl('https://youtu.be/dQw4w9WgXcQ', 'https://x.com/og.jpg'),
    ).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  it('usa el og:image si el source no es un video de YouTube', () => {
    expect(resolveThumbnailUrl('https://example.com/a', 'https://x.com/og.jpg')).toBe(
      'https://x.com/og.jpg',
    )
  })

  it('null si no hay ni YouTube ni og:image', () => {
    expect(resolveThumbnailUrl('https://example.com/a', null)).toBeNull()
    expect(resolveThumbnailUrl(null, null)).toBeNull()
  })
})

describe('imageMimeFromContentType', () => {
  it('normaliza y acepta solo image/* soportados', () => {
    expect(imageMimeFromContentType('image/jpeg; charset=binary')).toBe('image/jpeg')
    expect(imageMimeFromContentType('IMAGE/PNG')).toBe('image/png')
    expect(imageMimeFromContentType('image/webp')).toBe('image/webp')
  })

  it('rechaza no-imágenes y mimes raros', () => {
    expect(imageMimeFromContentType('text/html')).toBeNull()
    expect(imageMimeFromContentType('image/svg+xml')).toBeNull()
    expect(imageMimeFromContentType(null)).toBeNull()
  })
})

describe('downloadThumbnail', () => {
  it('corta el stream y devuelve null si el body supera el tope sin Content-Length', async () => {
    // Stream de chunks de 1MB hasta pasar los 5MB, sin Content-Length.
    let emitted = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= 6) {
          controller.close()
          return
        }
        emitted += 1
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
    })
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      new Response(stream, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    )
    expect(await downloadThumbnail('https://x.com/big.jpg')).toBeNull()
  })

  it('devuelve bytes + mime en el camino feliz', async () => {
    ssrfMocks.safeFetchFollowingRedirects.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    const out = await downloadThumbnail('https://x.com/small.png')
    expect(out?.mime).toBe('image/png')
    expect(out?.bytes.byteLength).toBe(4)
  })

  it('null si la URL no es http(s)', async () => {
    expect(await downloadThumbnail('ftp://x.com/a.jpg')).toBeNull()
    expect(await downloadThumbnail('no-es-url')).toBeNull()
    expect(ssrfMocks.safeFetchFollowingRedirects).not.toHaveBeenCalled()
  })

  it('null si el fetch SSRF-safe lanza (host bloqueado, etc.)', async () => {
    ssrfMocks.safeFetchFollowingRedirects.mockRejectedValueOnce(new Error('bloqueado'))
    expect(await downloadThumbnail('https://x.com/a.jpg')).toBeNull()
  })
})
