import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

// Test vive en _lib/ por restricciones de naming de Netlify Functions
// (no acepta `.test.ts` en /netlify/functions/). Por eso el handler es `../`
// y el mock del db es `./db.js` (path como lo resuelve vitest desde _lib/).
vi.mock('./db.js', () => setupMockSql())
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

import handler from '../relationships'

describe('relationships endpoint — integration', () => {
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

  it('GET devuelve lista — el servidor pasa rows tal cual (cliente transforma a camelCase)', async () => {
    mockSqlResponses.push([
      {
        id: 'r1',
        from_id: 'a',
        to_id: 'b',
        type: 'cita_a',
        notes: null,
        origin: { kind: 'manual' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/relationships'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toEqual(
      expect.objectContaining({ id: 'r1', from_id: 'a', to_id: 'b', type: 'cita_a' }),
    )
  })

  it('DELETE devuelve { deletedAt }', async () => {
    mockSqlResponses.push(
      [{ now: '2026-05-23T12:00:00Z' }],
      [], // UPDATE
    )
    const res = await handler(
      new Request('http://localhost/api/relationships/r1', { method: 'DELETE' }),
      mockContext({ id: 'r1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deletedAt).toBe('2026-05-23T12:00:00Z')
  })

  it('POST /:id/restore con deletedAt válido devuelve restored: true', async () => {
    mockSqlResponses.push([]) // UPDATE
    const res = await handler(
      new Request('http://localhost/api/relationships/r1/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-05-23T12:00:00Z' }),
      }),
      mockContext({ id: 'r1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.restored).toBe(true)
  })

  it('POST /:id/restore sin deletedAt devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/relationships/r1/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      mockContext({ id: 'r1' }),
    )
    expect(res.status).toBe(400)
  })
})
