import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectCanonicalError, mockContext } from './test-utils'

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
    await expectCanonicalError(method, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
    })

    const json = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    await expectCanonicalError(json, { status: 400, code: 'VALIDATION' })
  })

  it('valida presencia, mime y tamaño antes de persistir el blob', async () => {
    const missing = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: new FormData(),
      }),
      mockContext(),
    )
    await expectCanonicalError(missing, { status: 400, code: 'VALIDATION' })

    const wrongMime = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: formWithFile(new File(['x'], 'n.txt', { type: 'text/plain' })),
      }),
      mockContext(),
    )
    await expectCanonicalError(wrongMime, {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    })

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
    await expectCanonicalError(large, {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    })
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

  it('sube videos de recortes al mismo store de media', async () => {
    const res = await uploadHandler(
      new Request('http://localhost/api/recortes-image-upload', {
        method: 'POST',
        body: formWithFile(
          new File([new Uint8Array([1, 2, 3, 4])], 'clip.mp4', {
            type: 'video/mp4',
          }),
        ),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ mime: 'video/mp4', size: 4 })
    expect(body.imageKey).toMatch(/^legacy-single-user\/[a-f0-9]{32}\.mp4$/)
    expect(blobMocks.set).toHaveBeenCalledWith(body.imageKey, expect.any(ArrayBuffer), {
      metadata: { mime: 'video/mp4', size: '4' },
    })
  })
})

describe('recortes-image (servir)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    blobMocks.getWithMetadata.mockReset()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
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
    const events = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'blob.access.denied',
          category: 'operational',
          severity: 'warn',
          operation: 'recorte.blob.read',
          userId: 'legacy-single-user',
        }),
      ]),
    )
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
