import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext } from './test-utils'

/**
 * Endpoints de imagen interna de Recortes (Bloque B+): subida al store
 * privado `recortes-media` y servido autorizado por prefijo de usuario.
 * Espejo del molde de momentos-upload/file, con la diferencia clave de que
 * los recortes NO se comparten: la autorización es un match exacto del userId.
 */

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
  getWithMetadata: vi.fn(async () => null as unknown),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({
    set: blobMocks.set,
    getWithMetadata: blobMocks.getWithMetadata,
  })),
}))

import uploadHandler from '../recortes-image-upload'
import serveHandler from '../recortes-image'

function formWithFile(file: File) {
  const form = new FormData()
  form.set('file', file)
  return form
}

describe('recortes-image-upload', () => {
  beforeEach(() => {
    blobMocks.set.mockClear()
  })

  it('rechaza métodos no POST y bodies que no sean multipart', async () => {
    const method = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload'),
      mockContext(),
    )
    expect(method.status).toBe(405)

    const json = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(json.status).toBe(400)
  })

  it('valida presencia, mime y tamaño antes de persistir el blob', async () => {
    const missing = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: new FormData(),
      }),
      mockContext(),
    )
    expect(missing.status).toBe(400)

    const wrongMime = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: formWithFile(new File(['x'], 'n.txt', { type: 'text/plain' })),
      }),
      mockContext(),
    )
    expect(wrongMime.status).toBe(415)

    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.webp', {
      type: 'image/webp',
    })
    const large = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: formWithFile(tooLarge),
      }),
      mockContext(),
    )
    expect(large.status).toBe(413)
    expect(blobMocks.set).not.toHaveBeenCalled()
  })

  it('sube la imagen namespaced por usuario y devuelve imageKey', async () => {
    const res = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: formWithFile(
          new File([new Uint8Array([1, 2, 3])], 'region.webp', { type: 'image/webp' }),
        ),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ mime: 'image/webp', size: 3 })
    expect(body.imageKey).toMatch(/^legacy-single-user\/[a-f0-9]{32}\.webp$/)
    expect(blobMocks.set).toHaveBeenCalledWith(body.imageKey, expect.any(ArrayBuffer), {
      metadata: { mime: 'image/webp', size: '3' },
    })
  })
})

describe('recortes-image (servir)', () => {
  beforeEach(() => {
    blobMocks.getWithMetadata.mockReset()
  })

  it('rechaza métodos no GET', async () => {
    const res = await serveHandler(
      new Request('http://localhost/api/recortes-image/k', { method: 'POST' }),
      mockContext({ key: 'k' }),
    )
    expect(res.status).toBe(405)
  })

  it('404 si el prefijo de la key no es el usuario autenticado', async () => {
    const res = await serveHandler(
      new Request('http://localhost/api/recortes-image/otro/x.webp'),
      mockContext({ userId: 'otro', key: 'x.webp' }),
    )
    expect(res.status).toBe(404)
    expect(blobMocks.getWithMetadata).not.toHaveBeenCalled()
  })

  it('sirve el blob cuando el prefijo coincide con el usuario', async () => {
    blobMocks.getWithMetadata.mockResolvedValueOnce({
      data: new Uint8Array([9, 9]).buffer,
      metadata: { mime: 'image/webp' },
    })
    const res = await serveHandler(
      new Request('http://localhost/api/recortes-image/legacy-single-user/x.webp'),
      mockContext({ userId: 'legacy-single-user', key: 'x.webp' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('404 si el blob no existe aunque el prefijo sea válido', async () => {
    blobMocks.getWithMetadata.mockResolvedValueOnce(null)
    const res = await serveHandler(
      new Request('http://localhost/api/recortes-image/legacy-single-user/falta.webp'),
      mockContext({ userId: 'legacy-single-user', key: 'falta.webp' }),
    )
    expect(res.status).toBe(404)
  })
})
