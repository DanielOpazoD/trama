import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
  getWithMetadata: vi.fn(async () => ({
    data: '{"version":1}',
    etag: 'etag-1',
    metadata: {},
  })),
}))

vi.mock('./db.js', () => setupMockSql())
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({
    set: blobMocks.set,
    getWithMetadata: blobMocks.getWithMetadata,
  })),
}))

import handler from '../pdf-studio-templates'

const rowFixture = {
  id: 'remote-1',
  saved_doc_id: 'local-1',
  name: 'Receta',
  description: 'Receta magistral',
  tags: ['recetas'],
  status: 'ready',
  page_count: 2,
  field_count: 5,
  byte_size: 12,
  storage_key: 'legacy-single-user/local-1.json',
  saved_at: '2026-07-03T00:00:00.000Z',
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
}

describe('pdf-studio templates endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    blobMocks.set.mockClear()
    blobMocks.getWithMetadata.mockClear()
  })

  it('lista sólo plantillas del usuario autenticado, sin el paquete', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [rowFixture],
    )

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-templates'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject([
      { id: 'remote-1', savedDocId: 'local-1', status: 'ready', fieldCount: 5 },
    ])
    expect(JSON.stringify(body)).not.toContain('storage_key')
    const select = mockSqlState.calls.find((call) =>
      /FROM pdf_studio_templates/i.test(call.template),
    )
    expect(select?.template).toMatch(/user_id =/i)
    expect(select?.template).toMatch(/deleted_at IS NULL/i)
    expect(select?.values).toContain('legacy-single-user')
  })

  it('sube el paquete con key determinista por documento y upsert de metadata', async () => {
    mockSqlResponses.push([], [rowFixture])
    const form = new FormData()
    form.set('savedDocId', 'local-1')
    form.set('name', 'Receta')
    form.set('description', 'Receta magistral')
    form.set('tags', JSON.stringify(['recetas']))
    form.set('status', 'ready')
    form.set('savedAt', String(Date.parse('2026-07-03T00:00:00.000Z')))
    form.set('pageCount', '2')
    form.set('fieldCount', '5')
    form.set(
      'package',
      new File(['{"version":1}'], 'receta.json', { type: 'application/json' }),
    )

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-templates', {
        method: 'POST',
        body: form,
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      id: 'remote-1',
      savedDocId: 'local-1',
      name: 'Receta',
    })
    expect(blobMocks.set).toHaveBeenCalledWith(
      'legacy-single-user/local-1.json',
      expect.any(ArrayBuffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ mime: 'application/json' }),
      }),
    )
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO pdf_studio_templates/i.test(call.template),
    )
    expect(insert?.template).toMatch(/ON CONFLICT \(user_id, saved_doc_id\)/i)
    expect(insert?.values).toEqual(
      expect.arrayContaining(['legacy-single-user', 'local-1', 'Receta', 'ready']),
    )
    const manifestInsert = mockSqlState.calls.find((call) =>
      /INSERT INTO storage_assets/i.test(call.template),
    )
    expect(manifestInsert?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        'pdf-studio-templates',
        'pdf-studio-template',
        'local-1',
        'netlify-blobs',
        'application/json',
      ]),
    )
  })

  it('rechaza savedDocId fuera del charset seguro (arma la storage key)', async () => {
    mockSqlResponses.push([])
    const form = new FormData()
    form.set('savedDocId', '../otra-cuenta')
    form.set('name', 'Receta')
    form.set('savedAt', '1')
    form.set('package', new File(['{}'], 'p.json', { type: 'application/json' }))

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-templates', {
        method: 'POST',
        body: form,
      }),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(blobMocks.set).not.toHaveBeenCalled()
  })

  it('descarga el paquete verificando dueño y devuelve JSON', async () => {
    mockSqlResponses.push([], [{ storage_key: 'legacy-single-user/local-1.json' }])

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-templates/remote-1'),
      mockContext({ id: 'remote-1' }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ version: 1 })
    const select = mockSqlState.calls.find((call) =>
      /FROM pdf_studio_templates/i.test(call.template),
    )
    expect(select?.template).toMatch(/user_id =/i)
    expect(select?.template).toMatch(/deleted_at IS NULL/i)
  })

  it('borra con soft delete scoping por usuario y baja el manifiesto', async () => {
    mockSqlResponses.push(
      [],
      [{ id: 'remote-1', storage_key: 'legacy-single-user/local-1.json' }],
      [{ id: 'asset-1' }],
    )

    const res = await handler(
      new Request('http://localhost/api/pdf-studio-templates/remote-1', {
        method: 'DELETE',
      }),
      mockContext({ id: 'remote-1' }),
    )

    expect(res.status).toBe(204)
    const update = mockSqlState.calls.find((call) =>
      /UPDATE pdf_studio_templates/i.test(call.template),
    )
    expect(update?.template).toMatch(/SET deleted_at = NOW\(\)/i)
    expect(update?.template).toMatch(/user_id =/i)
    expect(update?.template).toMatch(/deleted_at IS NULL/i)
    const manifestUpdate = mockSqlState.calls.find((call) =>
      /UPDATE storage_assets/i.test(call.template),
    )
    expect(manifestUpdate?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        'pdf-studio-templates',
        'netlify-blobs',
        'legacy-single-user/local-1.json',
      ]),
    )
  })
})
