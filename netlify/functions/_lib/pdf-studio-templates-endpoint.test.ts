import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
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
    delete: blobMocks.delete,
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

  it('sube el paquete versionando la cabeza anterior en el mismo statement', async () => {
    mockSqlResponses.push([], [rowFixture], [{ id: 'asset-1' }], [])
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
      expect.stringMatching(/^legacy-single-user\/local-1\/[a-f0-9]{32}\.json$/),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ mime: 'application/json' }),
      }),
    )
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO pdf_studio_templates/i.test(call.template),
    )
    expect(insert?.template).toMatch(/ON CONFLICT \(user_id, saved_doc_id\)/i)
    expect(insert?.template).toMatch(/INSERT INTO pdf_studio_template_versions/i)
    expect(insert?.template).toMatch(/FROM head/i)
    const prune = mockSqlState.calls.find((call) =>
      /UPDATE pdf_studio_template_versions/i.test(call.template),
    )
    expect(prune?.template).toMatch(/OFFSET/i)
    expect(prune?.values).toContain('legacy-single-user')
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

  it('lista y descarga versiones verificando dueño', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow (lista)
      [
        {
          id: 'v1',
          name: 'Receta',
          byte_size: 10,
          saved_at: '2026-07-02T00:00:00.000Z',
          created_at: '2026-07-02T00:00:00.000Z',
        },
      ],
      [], // ensureUserRow (descarga)
      [{ storage_key: 'legacy-single-user/local-1/aa.json' }],
    )

    const list = await handler(
      new Request('http://localhost/api/pdf-studio-templates/remote-1/versions'),
      mockContext({ id: 'remote-1' }),
    )
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject([{ id: 'v1', byteSize: 10 }])
    const listSelect = mockSqlState.calls.find((call) =>
      /FROM pdf_studio_template_versions/i.test(call.template),
    )
    expect(listSelect?.template).toMatch(/user_id =/i)
    expect(listSelect?.template).toMatch(/deleted_at IS NULL/i)

    const download = await handler(
      new Request('http://localhost/api/pdf-studio-templates/remote-1/versions/v1'),
      mockContext({ id: 'remote-1', versionId: 'v1' }),
    )
    expect(download.status).toBe(200)
    expect(await download.json()).toEqual({ version: 1 })
  })

  it('borra con soft delete scoping por usuario y limpia historial y manifiesto', async () => {
    mockSqlResponses.push(
      [],
      [
        { kind: 'head', storage_key: 'legacy-single-user/local-1.json' },
        { kind: 'version', storage_key: 'legacy-single-user/local-1/old.json' },
      ],
      [{ id: 'asset-1' }],
      [{ id: 'asset-2' }],
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
    expect(update?.template).toMatch(/pdf_studio_template_versions/i)
    expect(update?.template).toMatch(/user_id =/i)
    expect(update?.template).toMatch(/deleted_at IS NULL/i)
    const manifestUpdates = mockSqlState.calls.filter((call) =>
      /UPDATE storage_assets/i.test(call.template),
    )
    expect(manifestUpdates).toHaveLength(2)
    expect(manifestUpdates[0]?.values).toEqual(
      expect.arrayContaining(['legacy-single-user', 'legacy-single-user/local-1.json']),
    )
    // El paquete histórico se borra de verdad del store (contenido privado).
    expect(blobMocks.delete).toHaveBeenCalledWith('legacy-single-user/local-1/old.json')
  })
})
