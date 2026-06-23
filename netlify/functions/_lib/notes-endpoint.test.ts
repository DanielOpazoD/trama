import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  setupMockSql,
} from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// embedSafe (en /promote) pega a la API de embeddings vía fetch. Lo neutralizamos
// con un fetch que falla → embedSafe devuelve null (best-effort) y el Momento se
// crea igual sin embedding.
function stubFailingFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
      json: async () => ({}),
    }),
  )
}

import handler from '../notes'

const NOTE_ROW = {
  id: 'n1',
  content: 'idea sobre #memoria',
  title: null,
  tags: ['memoria'],
  pinned: false,
  promoted_momento_id: null,
  source: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  has_images: false,
  has_audio: false,
}

describe('notes endpoint — integration', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    stubFailingFetch()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve la lista e incluye el flag has_images (EXISTS image/%)', async () => {
    mockSqlResponses.push([NOTE_ROW])
    const res = await handler(new Request('http://localhost/api/notes'), mockContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(1)
    // El SELECT deriva has_images con un EXISTS sobre notas_attachments image/%.
    const q = mockSqlResponses.calls.find((c) => /FROM notes/i.test(c.template))
    expect(q?.template).toMatch(/deleted_at IS NULL/i)
    expect(q?.template).toMatch(/user_id =/i)
    expect(q?.template).toMatch(/AS has_images/i)
    expect(q?.template).toMatch(/image\/%/i)
  })

  it('GET ?q y ?tag filtran dentro del usuario y excluyen soft-deleted', async () => {
    mockSqlResponses.push([NOTE_ROW], [NOTE_ROW])

    const byText = await handler(
      new Request('http://localhost/api/notes?q=%20memoria%20'),
      mockContext(),
    )
    const byTag = await handler(
      new Request('http://localhost/api/notes?tag=Memoria'),
      mockContext(),
    )

    expect(byText.status).toBe(200)
    expect(byTag.status).toBe(200)
    const search = mockSqlResponses.calls.find((c) => /content ILIKE/i.test(c.template))
    const tag = mockSqlResponses.calls.find((c) => /ANY\(tags\)/i.test(c.template))
    expect(search?.template).toMatch(/deleted_at IS NULL/i)
    expect(search?.template).toMatch(/user_id =/i)
    expect(search?.values).toContain('%memoria%')
    expect(tag?.template).toMatch(/deleted_at IS NULL/i)
    expect(tag?.template).toMatch(/user_id =/i)
    expect(tag?.values).toContain('memoria')
  })

  it('GET rechaza query params duplicados antes de consultar notas', async () => {
    const res = await handler(
      new Request('http://localhost/api/notes?q=uno&q=dos', {
        headers: { 'x-request-id': 'rid-note-query' },
      }),
      mockContext(),
    )

    const body = await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-note-query',
    })
    expect(body).toMatchObject({
      error: {
        message: 'Query params inválidos',
        details: { issues: [{ path: 'q' }] },
      },
    })
    expect(
      mockSqlResponses.calls.some((call) => /\bFROM notes\b/i.test(call.template)),
    ).toBe(false)
  })

  it('POST con content válido crea (201) y deriva tags', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [NOTE_ROW],
    )
    const res = await handler(
      new Request('http://localhost/api/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'idea sobre #memoria' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    expect((await res.json()).tags).toEqual(['memoria'])
  })

  it('POST con title lo inserta junto al content', async () => {
    mockSqlResponses.push([], [{ ...NOTE_ROW, title: 'Mi título' }])
    const res = await handler(
      new Request('http://localhost/api/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'cuerpo', title: 'Mi título' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO notes/i.test(c.template),
    )
    expect(insert?.template).toMatch(/\(content, title, tags, pinned, user_id\)/i)
    expect(insert?.values).toContain('Mi título')
  })

  it('PATCH title:null lo borra (CASE provisto → null)', async () => {
    mockSqlResponses.push([{ ...NOTE_ROW, title: null }])
    const res = await handler(
      new Request('http://localhost/api/notes/n1', {
        method: 'PATCH',
        body: JSON.stringify({ title: null }),
      }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(200)
    const update = mockSqlResponses.calls.find((c) => /UPDATE notes/i.test(c.template))
    // El CASE de title recibe `true` (provisto) y el valor normalizado (null).
    expect(update?.template).toMatch(/title = CASE/i)
    expect(update?.values).toContain(true)
  })

  it('POST con content vacío devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/notes', {
        method: 'POST',
        headers: { 'x-request-id': 'rid-note-validation' },
        body: JSON.stringify({ content: '' }),
      }),
      mockContext(),
    )
    const body = await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-note-validation',
    })
    expect(body).toMatchObject({ error: { details: { issues: [{ path: 'content' }] } } })
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO notes/i.test(c.template)),
    ).toBe(false)
  })

  it('PATCH pinned:true devuelve 200', async () => {
    mockSqlResponses.push([{ ...NOTE_ROW, pinned: true }])
    const res = await handler(
      new Request('http://localhost/api/notes/n1', {
        method: 'PATCH',
        body: JSON.stringify({ pinned: true }),
      }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).pinned).toBe(true)
  })

  it('PATCH content re-deriva tags y mantiene scope por usuario', async () => {
    mockSqlResponses.push([
      { ...NOTE_ROW, content: 'nueva #claridad', tags: ['claridad'] },
    ])

    const res = await handler(
      new Request('http://localhost/api/notes/n1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'nueva #claridad' }),
      }),
      mockContext({ id: 'n1' }),
    )

    expect(res.status).toBe(200)
    const update = mockSqlResponses.calls.find((c) => /UPDATE notes/i.test(c.template))
    expect(update?.template).toMatch(/deleted_at IS NULL/i)
    expect(update?.template).toMatch(/user_id =/i)
    expect(update?.values).toContainEqual(['claridad'])
  })

  it('PATCH inexistente devuelve 404', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/notes/nope', {
        method: 'PATCH',
        headers: { 'x-request-id': 'rid-note-patch' },
        body: JSON.stringify({ pinned: true }),
      }),
      mockContext({ id: 'nope' }),
    )
    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-note-patch',
    })
  })

  it('DELETE hace soft-delete atómico (un CTE, nunca DELETE FROM) y devuelve deletedAt', async () => {
    mockSqlResponses.push([{ deleted_at: '2026-06-10T12:00:00Z' }])
    const res = await handler(
      new Request('http://localhost/api/notes/n1', { method: 'DELETE' }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.deletedAt).toBe('2026-06-10T12:00:00Z')
    expect(
      mockSqlResponses.calls.some((c) => /DELETE FROM notes/i.test(c.template)),
    ).toBe(false)
    // Nota + anexos caen en el MISMO CTE (mismo deleted_at — restaurable en bloque).
    const cte = mockSqlResponses.calls[0]?.template ?? ''
    expect(cte).toMatch(/UPDATE notes SET deleted_at/i)
    expect(cte).toMatch(/UPDATE notas_attachments/i)
    expect(cte).toMatch(/owner_type = 'note'/i)
    expect(cte).toMatch(/user_id =/i)
    expect(cte).toMatch(/SELECT deleted_at FROM del_note/i)
  })

  it('DELETE inexistente o de otro usuario devuelve 404, no 200 no-op', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/notes/n1', {
        method: 'DELETE',
        headers: { 'x-request-id': 'rid-note-delete' },
      }),
      mockContext({ id: 'n1' }),
    )
    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-note-delete',
    })
  })

  it('POST /:id/restore revive nota + anexos con el deleted_at exacto', async () => {
    mockSqlResponses.push([{ restored: true }])
    const res = await handler(
      new Request('http://localhost/api/notes/n1/restore', {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2026-06-10T12:00:00Z' }),
      }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).restored).toBe(true)
    const cte = mockSqlResponses.calls[0]?.template ?? ''
    expect(cte).toMatch(/UPDATE notes SET deleted_at = NULL/i)
    expect(cte).toMatch(/UPDATE notas_attachments SET deleted_at = NULL/i)
    expect(cte).toMatch(/deleted_at = \?/)
  })

  it('restore con deleted_at que ya no coincide devuelve 404', async () => {
    mockSqlResponses.push([{ restored: false }])
    const res = await handler(
      new Request('http://localhost/api/notes/n1/restore', {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2020-01-01T00:00:00Z' }),
      }),
      mockContext({ id: 'n1' }),
    )
    await expectCanonicalError(res, { status: 404, code: 'NOT_FOUND' })
  })

  it('promote: nota inexistente devuelve 404', async () => {
    mockSqlResponses.push([]) // SELECT note vacío
    const res = await handler(
      new Request('http://localhost/api/notes/nope/promote', { method: 'POST' }),
      mockContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('promote: nota ya promovida devuelve 400', async () => {
    mockSqlResponses.push([
      { content: 'x', promoted: 'm-existente', created_at: '2026-05-01T00:00:00Z' },
    ])
    const res = await handler(
      new Request('http://localhost/api/notes/n1/promote', { method: 'POST' }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(400)
  })

  it('promote: nota nueva crea el Momento y devuelve {momentoId} (201)', async () => {
    mockSqlResponses.push(
      [{ content: 'idea', promoted: null, created_at: '2026-05-01T00:00:00Z' }], // SELECT
      [], // ensureUserRow
      [{ id: 'm-nuevo' }], // INSERT momento RETURNING id
      [], // UPDATE notes
    )
    const res = await handler(
      new Request('http://localhost/api/notes/n1/promote', { method: 'POST' }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(201)
    expect((await res.json()).momentoId).toBe('m-nuevo')
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/notes', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
