import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
}))

vi.mock('./db.js', () => setupMockSql())
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({ set: blobMocks.set })),
}))

import handler from '../pdf-studio-saved-pdfs'

describe('pdf-studio saved PDFs endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    blobMocks.set.mockClear()
  })

  it('lista sólo PDFs guardados del usuario autenticado', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [
        {
          id: 'remote-1',
          saved_doc_id: 'local-1',
          name: 'Receta',
          kind: 'creation',
          mime_type: 'application/pdf',
          byte_size: 3,
          storage_key: 'legacy-single-user/remote-1.pdf',
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
      [{ id: 'asset-pdf' }],
    )

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-saved-pdfs'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject([
      {
        id: 'remote-1',
        savedDocId: 'local-1',
        storageKey: 'legacy-single-user/remote-1.pdf',
      },
    ])
    const select = mockSqlState.calls.find((call) =>
      /FROM pdf_studio_saved_pdfs/i.test(call.template),
    )
    expect(select?.template).toMatch(/user_id =/i)
    expect(select?.template).toMatch(/deleted_at IS NULL/i)
    expect(select?.values).toContain('legacy-single-user')
  })

  it('sube un PDF namespaced por usuario y persiste metadata con upsert', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [
        {
          id: 'remote-1',
          saved_doc_id: 'local-1',
          name: 'Mi receta',
          kind: 'creation',
          mime_type: 'application/pdf',
          byte_size: 3,
          storage_key: 'legacy-single-user/abc.pdf',
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
    )
    const form = new FormData()
    form.set('savedDocId', 'local-1')
    form.set('name', 'Mi receta')
    form.set('kind', 'creation')
    form.set('file', new File(['pdf'], 'mi-receta.pdf', { type: 'application/pdf' }))

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-saved-pdfs', {
        method: 'POST',
        body: form,
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      id: 'remote-1',
      savedDocId: 'local-1',
      name: 'Mi receta',
      byteSize: 3,
    })
    expect(blobMocks.set).toHaveBeenCalledWith(
      expect.stringMatching(/^legacy-single-user\/[a-f0-9]{32}\.pdf$/),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ mime: 'application/pdf', name: 'Mi receta' }),
      }),
    )
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO pdf_studio_saved_pdfs/i.test(call.template),
    )
    expect(insert?.template).toMatch(/ON CONFLICT \(user_id, saved_doc_id\)/i)
    expect(insert?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        'local-1',
        'Mi receta',
        'creation',
        3,
      ]),
    )
    const manifestInsert = mockSqlState.calls.find((call) =>
      /INSERT INTO storage_assets/i.test(call.template),
    )
    expect(manifestInsert?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        'pdf-studio-saved-pdfs',
        'pdf-studio-saved-doc',
        'local-1',
        'netlify-blobs',
        'application/pdf',
        3,
      ]),
    )
  })

  it('borra con soft delete scoping por usuario', async () => {
    mockSqlResponses.push(
      [],
      [{ id: 'remote-1', storage_key: 'legacy-single-user/abc.pdf' }],
      [{ id: 'asset-pdf' }],
    )

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-saved-pdfs/remote-1', {
        method: 'DELETE',
      }),
      mockContext({ id: 'remote-1' }),
    )

    expect(res.status).toBe(204)
    const update = mockSqlState.calls.find((call) =>
      /UPDATE pdf_studio_saved_pdfs/i.test(call.template),
    )
    expect(update?.template).toMatch(/SET deleted_at = NOW\(\)/i)
    expect(update?.template).toMatch(/user_id =/i)
    expect(update?.template).toMatch(/deleted_at IS NULL/i)
    expect(update?.values).toEqual(
      expect.arrayContaining(['remote-1', 'legacy-single-user']),
    )
    const manifestUpdate = mockSqlState.calls.find((call) =>
      /UPDATE storage_assets/i.test(call.template),
    )
    expect(manifestUpdate?.template).toMatch(/user_id =/i)
    expect(manifestUpdate?.template).toMatch(/deleted_at IS NULL/i)
    expect(manifestUpdate?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        'pdf-studio-saved-pdfs',
        'netlify-blobs',
        'legacy-single-user/abc.pdf',
      ]),
    )
  })
})
