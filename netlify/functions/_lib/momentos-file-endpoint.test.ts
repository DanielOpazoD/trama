import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const verifyTokenMock = vi.hoisted(() => vi.fn())
vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}))

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
    mockSqlResponses.reset()
    verifyTokenMock.mockReset()
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
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vary')).toContain('Authorization')
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

  it('sirve keys namespaced cuando llegan como segmentos reales del path', async () => {
    const res = await handler(
      new Request(
        'http://localhost/api/momentos-file/legacy-single-user/foto%20nueva.jpg',
      ),
      mockContext({ userId: 'legacy-single-user', key: 'foto%20nueva.jpg' }),
    )

    expect(res.status).toBe(200)
    expect(getWithMetadata).toHaveBeenCalledWith('legacy-single-user/foto nueva.jpg', {
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
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
    expect(getWithMetadata).not.toHaveBeenCalled()
  })

  it('sirve una key legacy a un usuario Clerk cuando su Momento la referencia', async () => {
    process.env['CLERK_SECRET_KEY'] = 'secret'
    verifyTokenMock.mockResolvedValue({ sub: 'user_actual' })
    mockSqlResponses.push([{ set_config: 'user_actual' }])
    mockSqlResponses.push([{ referenced: true }])

    const res = await handler(
      new Request('http://localhost/api/momentos-file/legacy-single-user/voz.webm', {
        headers: { authorization: 'Bearer token' },
      }),
      mockContext({ userId: 'legacy-single-user', key: 'voz.webm' }),
    )

    expect(res.status).toBe(200)
    expect(getWithMetadata).toHaveBeenCalledWith('legacy-single-user/voz.webm', {
      type: 'arrayBuffer',
    })
    const referenceLookup = mockSqlState.calls.find((call) =>
      /FROM momentos/i.test(call.template),
    )
    expect(mockSqlState.calls[0]?.template).toMatch(/set_config\('app\.current_user_id'/)
    expect(referenceLookup?.template).toMatch(/deleted_at IS NULL/)
    expect(referenceLookup?.values).toContain('user_actual')
    expect(referenceLookup?.values).toContain('legacy-single-user/voz.webm')
  })
})
