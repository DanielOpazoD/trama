import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

const blobMocks = {
  set: vi.fn(),
}

vi.mock('./db.js', () => setupMockSql())
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({ set: blobMocks.set })),
}))

import handler from '../notas-attachments-upload'

describe('notas attachments upload endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    blobMocks.set.mockReset()
  })

  it('acepta anexos privados no cifrados y persiste metadata por usuario', async () => {
    mockSqlResponses.push([])
    mockSqlResponses.push([{ exists: true }])
    mockSqlResponses.push([
      {
        id: 'a1',
        owner_type: 'prompt',
        owner_id: 'p1',
        file_name: 'brief.md',
        mime_type: 'text/markdown',
        byte_size: 27,
        storage_key: 'legacy-single-user/abc.md',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ])

    const form = new FormData()
    form.set('ownerType', 'prompt')
    form.set('ownerId', 'p1')
    form.set(
      'file',
      new File(['contenido privado del anexo'], 'brief.md', {
        type: 'text/markdown',
      }),
    )

    const res = await handler(
      new Request('http://localhost/api/notas-attachments-upload', {
        method: 'POST',
        body: form,
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      file_name: 'brief.md',
      mime_type: 'text/markdown',
      byte_size: 27,
    })
    expect(blobMocks.set).toHaveBeenCalledWith(
      expect.stringMatching(/^legacy-single-user\/[a-f0-9]+\.md$/),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ name: 'brief.md' }),
      }),
    )
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO notas_attachments/i.test(call.template),
    )
    expect(insert?.values).toContain('legacy-single-user')
    expect(insert?.values).toContain('brief.md')
    expect(insert?.values).toContain('text/markdown')
    expect(insert?.values).toContain(27)
  })

  it('rechaza anexos marcados como cifrados porque el vault aplica solo a Claves', async () => {
    const form = new FormData()
    form.set('ownerType', 'prompt')
    form.set('ownerId', 'p1')
    form.set('encrypted', '1')
    form.set('originalFileName', 'brief.md')
    form.set('originalMimeType', 'text/markdown')
    form.set('originalByteSize', '9')
    form.set(
      'file',
      new File(['contenido'], 'brief.md.tramaenc', {
        type: 'application/octet-stream',
      }),
    )

    const res = await handler(
      new Request('http://localhost/api/notas-attachments-upload', {
        method: 'POST',
        body: form,
      }),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { code: 'VALIDATION', message: 'Los anexos no usan cifrado de vault' },
    })
    expect(blobMocks.set).not.toHaveBeenCalled()
    expect(
      mockSqlState.calls.some((call) =>
        /INSERT INTO notas_attachments/i.test(call.template),
      ),
    ).toBe(false)
  })
})
