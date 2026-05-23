import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './_lib/test-utils'

vi.mock('./_lib/db.js', () => setupMockSql())
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: false, status: 500, text: async () => '', json: async () => ({}),
}))

import handler from './quotes'

describe('quotes endpoint — integration', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => '', json: async () => ({}),
    }))
  })

  it('GET devuelve lista en camelCase', async () => {
    mockSqlResponses.push([
      {
        id: 'q1',
        entity_id: 'e1',
        text: 'cita test',
        source: null,
        context: null,
        user_reflection: null,
        ai_reflection: null,
        ai_reflection_provider: null,
        ai_reflection_model: null,
        ai_reflection_at: null,
        linked_quote_ids: [],
        origin: { kind: 'manual' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/quotes'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toEqual(
      expect.objectContaining({ id: 'q1', entity_id: 'e1', text: 'cita test' }),
    )
  })

  it('DELETE devuelve { deletedAt }', async () => {
    mockSqlResponses.push([{ now: '2026-05-23T12:00:00Z' }], [])
    const res = await handler(
      new Request('http://localhost/api/quotes/q1', { method: 'DELETE' }),
      mockContext({ id: 'q1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deletedAt).toBe('2026-05-23T12:00:00Z')
  })

  it('POST /:id/restore con deletedAt válido devuelve restored: true', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/quotes/q1/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-05-23T12:00:00Z' }),
      }),
      mockContext({ id: 'q1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.restored).toBe(true)
  })

  it('POST /:id/restore sin deletedAt devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/quotes/q1/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      mockContext({ id: 'q1' }),
    )
    expect(res.status).toBe(400)
  })
})
