import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
// embedSafe llama fetch a OpenAI — stubeamos a fail para forzar "sin embedding".
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

import handler from '../momentos'

describe('momentos endpoint — integration (mock SQL)', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '',
        json: async () => ({}),
      }),
    )
  })

  it('GET list devuelve items + nextCursor null cuando no hay más páginas', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { bodyText: 'hola' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    // Bulk-fetch de links: array vacío (no hay vínculos).
    mockSqlResponses.push([])

    const res = await handler(new Request('http://localhost/api/momentos'), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: unknown }
    expect(body.items).toHaveLength(1)
    expect(body.nextCursor).toBeNull()
  })

  it('GET list propaga entity_ids del bulk fetch a cada item', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'recorte',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { title: 'X' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    mockSqlResponses.push([
      { momento_id: 'm1', entity_id: 'e1' },
      { momento_id: 'm1', entity_id: 'e2' },
    ])
    const res = await handler(new Request('http://localhost/api/momentos'), mockContext())
    const body = (await res.json()) as {
      items: Array<{ entity_ids: string[] }>
    }
    expect(body.items[0].entity_ids).toEqual(['e1', 'e2'])
  })

  it('GET :id devuelve el momento + entity_ids', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {},
        note: 'x',
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    mockSqlResponses.push([{ entity_id: 'e1' }])
    const res = await handler(
      new Request('http://localhost/api/momentos/m1'),
      mockContext({ id: 'm1' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; entity_ids: string[] }
    expect(body.id).toBe('m1')
    expect(body.entity_ids).toEqual(['e1'])
  })

  it('GET :id devuelve 404 si no existe', async () => {
    mockSqlResponses.push([]) // sin resultados
    const res = await handler(
      new Request('http://localhost/api/momentos/nope'),
      mockContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('POST con kind inválido devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: JSON.stringify({ kind: 'meme', payload: {} }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toMatch(/kind/i)
  })

  it('POST con body inválido (no JSON) devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: 'no es json',
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('POST nota válida devuelve 201 con el row creado', async () => {
    mockSqlResponses.push([
      {
        id: 'new-1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { bodyText: 'una nota' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'nota',
          payload: { bodyText: 'una nota' },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; entity_ids: string[] }
    expect(body.id).toBe('new-1')
    expect(body.entity_ids).toEqual([])
  })

  it('POST con entity_ids inserta en momento_entities', async () => {
    mockSqlResponses.push([
      {
        id: 'new-2',
        kind: 'recorte',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { title: 'X' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    // Respuesta del INSERT INTO momento_entities (vacía es OK).
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'recorte',
          payload: { title: 'X' },
          entity_ids: ['e1', 'e2'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    // Debe haberse ejecutado al menos 2 queries: INSERT momento + INSERT junction
    expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(2)
    const junctionCall = mockSqlResponses.calls.find((c) =>
      c.template.includes('momento_entities'),
    )
    expect(junctionCall).toBeDefined()
  })

  it('DELETE devuelve { deletedAt } si existe', async () => {
    mockSqlResponses.push([{ id: 'm1', deleted_at: '2026-05-24T13:00:00Z' }])
    const res = await handler(
      new Request('http://localhost/api/momentos/m1', { method: 'DELETE' }),
      mockContext({ id: 'm1' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deletedAt: string }
    expect(body.deletedAt).toBe('2026-05-24T13:00:00Z')
  })

  it('DELETE devuelve 404 si no existía (UPDATE returning vacío)', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/momentos/nope', { method: 'DELETE' }),
      mockContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('PATCH devuelve 404 si el momento no existe', async () => {
    mockSqlResponses.push([]) // lookup vacío
    const res = await handler(
      new Request('http://localhost/api/momentos/x', {
        method: 'PATCH',
        body: JSON.stringify({ note: 'cambiada' }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext({ id: 'x' }),
    )
    expect(res.status).toBe(404)
  })

  it('métodos no soportados devuelven 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
