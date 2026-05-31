import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext } from './test-utils'

const { getWithMetadata } = vi.hoisted(() => ({
  getWithMetadata: vi.fn(async () => ({
    data: new Uint8Array([1, 2, 3]).buffer,
    metadata: { mime: 'image/jpeg' },
  })),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({ getWithMetadata }),
}))

import handler from '../momentos-file'

describe('momentos-file endpoint', () => {
  const originalClerkSecret = process.env['CLERK_SECRET_KEY']
  const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']

  beforeEach(() => {
    getWithMetadata.mockClear()
    getWithMetadata.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]).buffer,
      metadata: { mime: 'image/jpeg' },
    })
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
  })

  afterEach(() => {
    if (originalClerkSecret === undefined) delete process.env['CLERK_SECRET_KEY']
    else process.env['CLERK_SECRET_KEY'] = originalClerkSecret
    if (originalFallback === undefined) delete process.env['ALLOW_LEGACY_FALLBACK']
    else process.env['ALLOW_LEGACY_FALLBACK'] = originalFallback
    vi.unstubAllGlobals()
  })

  it('sirve keys legacy solo cuando la request resuelve al usuario legacy', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-file/foto.jpg'),
      mockContext({ key: 'foto.jpg' }),
    )

    expect(res.status).toBe(200)
    expect(getWithMetadata).toHaveBeenCalledWith('foto.jpg', { type: 'arrayBuffer' })
  })

  it('decodifica keys namespaced que llegan percent-encoded desde el cliente', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-file/legacy-single-user%2Ffoto.jpg'),
      mockContext({ key: 'legacy-single-user%2Ffoto.jpg' }),
    )

    expect(res.status).toBe(200)
    expect(getWithMetadata).toHaveBeenCalledWith('legacy-single-user/foto.jpg', {
      type: 'arrayBuffer',
    })
  })

  it('con Clerk estricto, una key legacy sin token no cae a lectura pública', async () => {
    process.env['CLERK_SECRET_KEY'] = 'secret'

    const res = await handler(
      new Request('http://localhost/api/momentos-file/foto.jpg'),
      mockContext({ key: 'foto.jpg' }),
    )

    expect(res.status).toBe(401)
    expect(getWithMetadata).not.toHaveBeenCalled()
  })

  it('no sirve blobs namespaced de otro usuario', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-file/otro/foto.jpg'),
      mockContext({ key: 'otro/foto.jpg' }),
    )

    expect(res.status).toBe(404)
    expect(getWithMetadata).not.toHaveBeenCalled()
  })
})
