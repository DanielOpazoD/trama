import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiRequest, buildJsonApiRequest, TEST_USERS } from './test-fixtures'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  setupMockSql,
} from './test-utils'

vi.mock('./db.js', () => setupMockSql())

vi.mock('./auth.js', async () => {
  const actual = await vi.importActual<typeof import('./auth')>('./auth.js')
  return {
    ...actual,
    getAuthedUser: vi.fn(async (req: Request) => {
      const bearer = req.headers.get('authorization')?.replace('Bearer ', '').trim()
      if (bearer === TEST_USERS.b.token) return { id: TEST_USERS.b.id }
      return { id: TEST_USERS.a.id, email: TEST_USERS.a.email }
    }),
  }
})

import handler from '../pdf-stamp-assets'

const PNG_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'signature-1',
    user_id: TEST_USERS.a.id,
    kind: 'signature',
    name: 'Firma Daniel',
    src: PNG_SRC,
    mime_type: 'image/png',
    width: 320,
    height: 120,
    byte_size: PNG_SRC.length,
    created_at: '2026-06-20T22:00:00.000Z',
    updated_at: '2026-06-20T22:01:00.000Z',
    last_used_at: '2026-06-20T22:02:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockSqlResponses.reset()
})

describe('pdf-stamp-assets endpoint', () => {
  it('GET lista solo assets activos del usuario autenticado', async () => {
    mockSqlResponses.push([row()])

    const res = await handler(
      buildApiRequest('/api/pdf-stamp-assets', { user: TEST_USERS.a }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([row()])
    const select = mockSqlResponses.calls[0]
    expect(select?.template).toMatch(/FROM pdf_stamp_assets/i)
    expect(select?.template).toMatch(/deleted_at IS NULL/i)
    expect(select?.template).toMatch(/user_id = /i)
    expect(select?.values).toContain(TEST_USERS.a.id)
  })

  it('POST crea un asset con ensureUserRow y calcula byte_size sin loguear src', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([row({ id: 'stamp-1', kind: 'stamp', name: 'Timbre' })])

    const res = await handler(
      buildJsonApiRequest('/api/pdf-stamp-assets', {
        method: 'POST',
        user: TEST_USERS.a,
        json: {
          id: 'stamp-1',
          kind: 'stamp',
          name: 'Timbre',
          src: PNG_SRC,
          mimeType: 'image/png',
          width: 320,
          height: 120,
        },
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    const [, insert] = mockSqlResponses.calls
    expect(insert?.template).toMatch(/INSERT INTO pdf_stamp_assets/i)
    expect(insert?.template).toMatch(/deleted_at = NULL/i)
    expect(insert?.template).toMatch(/user_id/i)
    expect(insert?.values).toContain(TEST_USERS.a.id)
    expect(insert?.values).toContain(PNG_SRC.length)
    expect(await res.json()).toMatchObject({ id: 'stamp-1', kind: 'stamp' })
  })

  it('POST rechaza data URL que no corresponde al MIME declarado', async () => {
    const res = await handler(
      buildJsonApiRequest('/api/pdf-stamp-assets', {
        method: 'POST',
        user: TEST_USERS.a,
        requestId: 'rid-invalid-mime',
        json: {
          id: 'signature-2',
          kind: 'signature',
          name: 'Firma',
          src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
          mimeType: 'image/png',
          width: 1,
          height: 1,
        },
      }),
      mockContext(),
    )

    await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-invalid-mime',
    })
  })

  it('POST responde 413 para data URL que supera el límite de bytes', async () => {
    const tooLargeSrc = `data:image/png;base64,${'a'.repeat(750_001)}`

    const res = await handler(
      buildJsonApiRequest('/api/pdf-stamp-assets', {
        method: 'POST',
        user: TEST_USERS.a,
        requestId: 'rid-too-large',
        json: {
          id: 'signature-large',
          kind: 'signature',
          name: 'Firma pesada',
          src: tooLargeSrc,
          mimeType: 'image/png',
          width: 1,
          height: 1,
        },
      }),
      mockContext(),
    )

    await expectCanonicalError(res, {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      requestId: 'rid-too-large',
    })
  })

  it('PATCH renombra solo filas propias activas y devuelve 404 si no toca filas', async () => {
    mockSqlResponses.push([])

    const res = await handler(
      buildJsonApiRequest('/api/pdf-stamp-assets/signature-1', {
        method: 'PATCH',
        user: TEST_USERS.b,
        requestId: 'rid-owner-mismatch',
        json: { name: 'Firma ajena' },
      }),
      mockContext({ id: 'signature-1' }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-owner-mismatch',
    })
    const update = mockSqlResponses.calls[0]
    expect(update?.template).toMatch(/UPDATE pdf_stamp_assets/i)
    expect(update?.template).toMatch(/deleted_at IS NULL/i)
    expect(update?.template).toMatch(/user_id = /i)
    expect(update?.template).toMatch(/RETURNING/i)
    expect(update?.values).toContain(TEST_USERS.b.id)
  })

  it('POST /:id/touch actualiza last_used_at con ownership y soft-delete filter', async () => {
    mockSqlResponses.push([row({ last_used_at: '2026-06-20T23:00:00.000Z' })])

    const res = await handler(
      buildApiRequest('/api/pdf-stamp-assets/signature-1/touch', {
        method: 'POST',
        user: TEST_USERS.a,
      }),
      mockContext({ id: 'signature-1' }),
    )

    expect(res.status).toBe(200)
    const update = mockSqlResponses.calls[0]
    expect(update?.template).toMatch(/last_used_at = NOW\(\)/i)
    expect(update?.template).toMatch(/WHERE id = /i)
    expect(update?.template).toMatch(/user_id = /i)
  })

  it('DELETE hace soft-delete y responde 404 para ids ajenos o inexistentes', async () => {
    mockSqlResponses.push([])

    const res = await handler(
      buildApiRequest('/api/pdf-stamp-assets/stamp-1', {
        method: 'DELETE',
        user: TEST_USERS.a,
        requestId: 'rid-delete-missing',
      }),
      mockContext({ id: 'stamp-1' }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-delete-missing',
    })
    const update = mockSqlResponses.calls[0]
    expect(update?.template).toMatch(/SET deleted_at = NOW\(\)/i)
    expect(update?.template).toMatch(/RETURNING id/i)
  })
})
