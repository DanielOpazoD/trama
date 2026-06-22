import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// Clerk no configurado → getAuthedUser cae a legacy-single-user (auth ok). Para
// el caso "anónimo rechazado" stubbeamos Clerk configurado SIN token.
vi.stubGlobal('Netlify', { env: { get: () => undefined } })

const presignPutMock = vi.fn(async (key: string) => `https://r2.example/${key}?sig=1`)
const isR2ConfiguredMock = vi.fn(() => true)
vi.mock('./r2.js', () => ({
  isR2Configured: () => isR2ConfiguredMock(),
  presignPut: (key: string) => presignPutMock(key),
}))

// ensureUserRow no debe tocar nada relevante en estos tests.
vi.mock('./user-provisioning.js', () => ({ ensureUserRow: vi.fn(async () => {}) }))

import handler from '../library-uploads-presign'

function postPresign(body: unknown, token?: string) {
  return handler(
    new Request('http://localhost/api/library-uploads-presign', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    mockContext({}),
  )
}

const VALID = { fileName: 'video.mp4', mimeType: 'video/mp4', byteSize: 50_000_000 }

describe('library-uploads-presign endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    presignPutMock.mockClear()
    isR2ConfiguredMock.mockReturnValue(true)
    vi.stubGlobal('Netlify', { env: { get: () => undefined } })
  })
  afterEach(() => {
    mockSqlResponses.reset()
    vi.unstubAllGlobals()
  })

  it('rechaza método ≠ POST con 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/library-uploads-presign', { method: 'GET' }),
      mockContext({}),
    )
    expect(res.status).toBe(405)
  })

  it('exige autenticación (Clerk configurado, sin token → 401)', async () => {
    // Clerk configurado y SIN fallback → request sin token es 401.
    vi.stubGlobal('Netlify', {
      env: { get: (k: string) => (k === 'CLERK_SECRET_KEY' ? 'sk_test' : undefined) },
    })
    const res = await postPresign(VALID)
    expect(res.status).toBe(401)
  })

  it('firma una URL y devuelve uploadUrl + storageKey namespaceado por usuario', async () => {
    const res = await postPresign(VALID)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { uploadUrl: string; storageKey: string }
    // legacy-single-user es el id sin Clerk; la key arranca con `${userId}/`.
    expect(body.storageKey).toMatch(/^legacy-single-user\/[0-9a-f]{32}\.mp4$/)
    expect(body.uploadUrl).toContain(body.storageKey)
    expect(presignPutMock).toHaveBeenCalledWith(body.storageKey)
  })

  it('rechaza un mimeType no permitido con 415', async () => {
    const res = await postPresign({ ...VALID, mimeType: 'application/x-msdownload' })
    expect(res.status).toBe(415)
  })

  it('devuelve error claro si R2 no está configurado', async () => {
    isR2ConfiguredMock.mockReturnValue(false)
    const res = await postPresign(VALID)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('R2')
    expect(presignPutMock).not.toHaveBeenCalled()
  })

  it('rechaza un body inválido (byteSize sobre el tope) con 400', async () => {
    const res = await postPresign({ ...VALID, byteSize: 999_999_999 })
    expect(res.status).toBe(400)
  })
})
