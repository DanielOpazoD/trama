import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  mockSqlState,
  setupMockSql,
} from './test-utils'
import { TEST_USERS, buildApiRequest, buildNotasAttachmentRow } from './test-fixtures'

vi.mock('./db.js', () => setupMockSql())

import handler from '../notas-attachments'

describe('notas attachments endpoint', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSqlResponses.reset()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('no lista anexos si la nota dueña ya no existe para el usuario actual', async () => {
    mockSqlResponses.push([{ exists: false }])

    const res = await handler(
      buildApiRequest('/api/notas-attachments', {
        query: { ownerType: 'note', ownerId: ' n1 ' },
      }),
      mockContext(),
    )

    await expectCanonicalError(res, { status: 404, code: 'NOT_FOUND' })
    expect(mockSqlState.calls[0]?.template).toMatch(/FROM notes/)
    expect(mockSqlState.calls[0]?.template).toMatch(/deleted_at IS NULL/)
    expect(mockSqlState.calls[0]?.values).toContain('legacy-single-user')
    expect(
      mockSqlState.calls.some((call) => /FROM notas_attachments/i.test(call.template)),
    ).toBe(false)
  })

  it('rechaza owner params inválidos con error canónico antes de ownership lookup', async () => {
    const res = await handler(
      buildApiRequest('/api/notas-attachments?ownerType=note&ownerId=', {
        requestId: 'rid-attachment-query',
      }),
      mockContext(),
    )

    const body = await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-attachment-query',
    })
    expect(body).toMatchObject({
      error: {
        message: 'Query params inválidos',
        details: { issues: [{ path: 'ownerId' }] },
      },
    })
    expect(
      mockSqlState.calls.some((call) =>
        /\bFROM\s+(notes|prompts|tasks|notas_attachments)\b/i.test(call.template),
      ),
    ).toBe(false)
  })

  it('lista anexos solo cuando el prompt dueño sigue activo y pertenece al usuario', async () => {
    mockSqlResponses.push([{ exists: true }])
    mockSqlResponses.push([
      buildNotasAttachmentRow({
        id: 'a1',
        owner_type: 'prompt',
        owner_id: 'p1',
        file_name: 'brief.md',
        mime_type: 'text/markdown',
        byte_size: 42,
        storage_key: `${TEST_USERS.legacy.id}/brief.md`,
      }),
    ])

    const res = await handler(
      buildApiRequest('/api/notas-attachments', {
        query: { ownerType: 'prompt', ownerId: 'p1' },
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(1)
    expect(mockSqlState.calls[0]?.template).toMatch(/FROM prompts/)
    expect(mockSqlState.calls[1]?.template).toMatch(/FROM notas_attachments/)
    expect(mockSqlState.calls[1]?.values).toContain('legacy-single-user')
  })

  it('DELETE devuelve 404 si no tocó un anexo del usuario', async () => {
    mockSqlResponses.push([])

    const res = await handler(
      buildApiRequest('/api/notas-attachments/a1', {
        method: 'DELETE',
        requestId: 'rid-attachment-delete',
      }),
      mockContext({ id: 'a1' }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-attachment-delete',
    })
    const events = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'owner.mismatch',
          category: 'operational',
          severity: 'warn',
          requestId: 'rid-attachment-delete',
          operation: 'attachment.delete',
        }),
        expect.objectContaining({
          event: 'blob.access.denied',
          category: 'operational',
          severity: 'warn',
          requestId: 'rid-attachment-delete',
          operation: 'attachment.delete',
        }),
      ]),
    )
  })

  it('DELETE devuelve ok cuando soft-borra un anexo del usuario', async () => {
    mockSqlResponses.push([{ id: 'a1', storage_key: 'legacy-single-user/brief.md' }])
    mockSqlResponses.push([{ id: 'asset-attachment' }])

    const res = await handler(
      buildApiRequest('/api/notas-attachments/a1', { method: 'DELETE' }),
      mockContext({ id: 'a1' }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockSqlState.calls[0]?.template).toMatch(/RETURNING id, storage_key/i)
    const manifestUpdate = mockSqlState.calls.find((call) =>
      /UPDATE storage_assets/i.test(call.template),
    )
    expect(manifestUpdate?.template).toMatch(/user_id =/i)
    expect(manifestUpdate?.template).toMatch(/deleted_at IS NULL/i)
    expect(manifestUpdate?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        'notas-attachments',
        'netlify-blobs',
        'legacy-single-user/brief.md',
      ]),
    )
  })
})
