import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
// getAuthedUser hace Clerk + RLS; lo mockeamos para ejercitar el endpoint solo.
vi.mock('./auth.js', () => ({
  getAuthedUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))

import queryHandler from '../query'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => mockSqlResponses.reset())

describe('query endpoint', () => {
  it('POST con AST válido devuelve items', async () => {
    mockSqlResponses.push([
      {
        kind: 'entity',
        id: 'e1',
        title: 'Borges',
        snippet: 'escritor',
        sort_val: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        tags: [],
      },
    ])
    const res = await queryHandler(
      jsonRequest({
        from: ['entity'],
        where: { field: 'type', op: 'eq', value: 'persona' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ kind: 'entity', id: 'e1' })
    expect(body.nextCursor).toBeNull()
  })

  it('GET no permitido → 405', async () => {
    const res = await queryHandler(
      new Request('http://localhost/api/query'),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('body inválido (from vacío) → 400', async () => {
    const res = await queryHandler(jsonRequest({ from: [] }), mockContext())
    expect(res.status).toBe(400)
  })

  it('op inválido para el campo → 400 (QueryCompileError)', async () => {
    const res = await queryHandler(
      jsonRequest({ from: ['entity'], where: { field: 'type', op: 'lt', value: 'x' } }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })
})
