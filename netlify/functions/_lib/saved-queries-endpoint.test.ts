import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./auth.js', () => ({
  getAuthedUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))

import savedQueriesHandler from '../saved-queries'

function req(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/saved-queries', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Filósofos antiguos',
  description: null,
  query: { from: ['entity'], where: { field: 'year', op: 'lt', value: 1900 } },
  pinned: false,
  created_at: '2026-06-14T00:00:00Z',
  updated_at: '2026-06-14T00:00:00Z',
}

beforeEach(() => {
  mockSqlResponses.reset()
})

describe('saved-queries endpoint', () => {
  it('GET → lista las consultas del usuario (mapeadas a DTO camelCase)', async () => {
    mockSqlResponses.push([ROW])
    const res = await savedQueriesHandler(req('GET'), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ createdAt: string; query: unknown }>
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0].createdAt).toBe('2026-06-14T00:00:00Z')
    expect(body.items[0].query).toMatchObject({ from: ['entity'] })
  })

  it('POST → crea, asegura users(id) y valida el AST con QueryBody', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([ROW]) // INSERT ... RETURNING
    const res = await savedQueriesHandler(
      req('POST', { name: 'Filósofos antiguos', query: ROW.query }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.name).toBe('Filósofos antiguos')
    expect(body.id).toBe(ROW.id)
  })

  it('POST con AST inválido → 400 (lo rechaza QueryBody)', async () => {
    const res = await savedQueriesHandler(
      req('POST', { name: 'rota', query: { from: [] } }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('POST sin nombre → 400', async () => {
    const res = await savedQueriesHandler(
      req('POST', { query: ROW.query }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('PATCH → actualiza y devuelve el DTO', async () => {
    mockSqlResponses.push([{ ...ROW, name: 'Renombrada', pinned: true }])
    const res = await savedQueriesHandler(
      req('PATCH', { id: ROW.id, name: 'Renombrada', pinned: true }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; pinned: boolean }
    expect(body.name).toBe('Renombrada')
    expect(body.pinned).toBe(true)
  })

  it('PATCH de una consulta inexistente → 404', async () => {
    mockSqlResponses.push([]) // UPDATE ... RETURNING vacío
    const res = await savedQueriesHandler(
      req('PATCH', { id: ROW.id, name: 'x' }),
      mockContext(),
    )
    expect(res.status).toBe(404)
  })

  it('DELETE → soft-delete (UPDATE deleted_at), 204', async () => {
    mockSqlResponses.push([{ id: ROW.id }]) // UPDATE ... RETURNING
    const res = await savedQueriesHandler(req('DELETE', { id: ROW.id }), mockContext())
    expect(res.status).toBe(204)
    const del = mockSqlResponses.calls.find((c) =>
      c.template.includes('deleted_at = NOW()'),
    )
    expect(del).toBeDefined()
    expect(del?.template).toMatch(/RETURNING id/i)
    // Nunca un DELETE físico sobre una tabla con deleted_at.
    expect(mockSqlResponses.calls.some((c) => /DELETE\s+FROM/i.test(c.template))).toBe(
      false,
    )
  })

  it('DELETE de una consulta inexistente → 404', async () => {
    mockSqlResponses.push([])
    const res = await savedQueriesHandler(req('DELETE', { id: ROW.id }), mockContext())

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('método no soportado → 405', async () => {
    const res = await savedQueriesHandler(req('PUT', {}), mockContext())
    expect(res.status).toBe(405)
  })
})
