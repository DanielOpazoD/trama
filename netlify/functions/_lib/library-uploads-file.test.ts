import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.stubGlobal('Netlify', { env: { get: () => undefined } })

const presignGetMock = vi.fn(async (key: string) => `https://r2.example/${key}?sig=read`)
vi.mock('./r2.js', () => ({ presignGet: (key: string) => presignGetMock(key) }))

const getWithMetadataMock = vi.fn(async () => ({
  data: new TextEncoder().encode('blob-bytes').buffer,
  etag: 'e1',
  metadata: { mime: 'application/pdf' },
}))
vi.mock('./storage-adapter.js', () => ({
  createNetlifyBlobStorageAdapter: () => ({ getWithMetadata: getWithMetadataMock }),
}))

import handler from '../library-uploads-file'

const USER = 'legacy-single-user'

function getFile(key: string) {
  return handler(
    new Request(`http://localhost/api/library-uploads-file/${key}`),
    mockContext({ userId: USER, key: key.split('/').slice(1).join('/') }),
  )
}

describe('library-uploads-file — serve por provider', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    presignGetMock.mockClear()
    getWithMetadataMock.mockClear()
  })
  afterEach(() => {
    mockSqlResponses.reset()
  })

  it('provider r2 → 302 redirect a la URL firmada (sin pasar el blob)', async () => {
    mockSqlResponses.push([{ mime_type: 'application/pdf', provider: 'r2' }])
    const res = await getFile(`${USER}/big.pdf`)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('big.pdf')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(presignGetMock).toHaveBeenCalledWith(`${USER}/big.pdf`)
    // No debe tocar Netlify Blobs para un objeto en R2.
    expect(getWithMetadataMock).not.toHaveBeenCalled()
  })

  it('provider netlify-blobs → sirve el blob directo (200)', async () => {
    mockSqlResponses.push([{ mime_type: 'application/pdf', provider: 'netlify-blobs' }])
    const res = await getFile(`${USER}/chico.pdf`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(getWithMetadataMock).toHaveBeenCalled()
    expect(presignGetMock).not.toHaveBeenCalled()
  })

  it('una key de otro usuario → 404 (authz por prefijo)', async () => {
    const res = await handler(
      new Request('http://localhost/api/library-uploads-file/otro/x.pdf'),
      mockContext({ userId: 'otro', key: 'x.pdf' }),
    )
    expect(res.status).toBe(404)
  })
})
