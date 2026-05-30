import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

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
  tags: ['memoria'],
  pinned: false,
  promoted_momento_id: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

describe('notes endpoint — integration', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    stubFailingFetch()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve la lista', async () => {
    mockSqlResponses.push([NOTE_ROW])
    const res = await handler(new Request('http://localhost/api/notes'), mockContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(1)
  })

  it('POST con content válido crea (201) y deriva tags', async () => {
    mockSqlResponses.push([NOTE_ROW])
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

  it('POST con content vacío devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/notes', {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
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

  it('PATCH inexistente devuelve 404', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/notes/nope', {
        method: 'PATCH',
        body: JSON.stringify({ pinned: true }),
      }),
      mockContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('DELETE hace soft-delete (UPDATE, nunca DELETE FROM)', async () => {
    const res = await handler(
      new Request('http://localhost/api/notes/n1', { method: 'DELETE' }),
      mockContext({ id: 'n1' }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(
      mockSqlResponses.calls.some((c) => /DELETE FROM notes/i.test(c.template)),
    ).toBe(false)
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
