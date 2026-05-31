import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

// Test vive en _lib/ por restricciones de naming de Netlify Functions.
// Handler en `../`, mock del db en `./db.js`.
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

import handler from '../quotes'

describe('quotes endpoint — integration', () => {
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
    const res = await handler(new Request('http://localhost/api/quotes'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toEqual(
      expect.objectContaining({ id: 'q1', entity_id: 'e1', text: 'cita test' }),
    )
  })

  it('PATCH con mismo texto fuente no re-embedea', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)
    mockSqlResponses.push(
      [], // ensureUserRow
      [
        {
          text: 'cita test',
          source: null,
          context: null,
          entity_id: 'e1',
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          text: 'cita test',
          source: null,
          context: null,
          link: null,
          user_reflection: null,
          ai_reflection: null,
          ai_reflection_provider: null,
          ai_reflection_model: null,
          ai_reflection_at: null,
          linked_quote_ids: [],
          pinned_at: null,
          resonance: null,
          origin: { kind: 'manual' },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/quotes/q1', {
        method: 'PATCH',
        body: JSON.stringify({ source: null }),
      }),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockSqlResponses.calls.some((c) => /SET embedding =/i.test(c.template))).toBe(
      false,
    )
  })

  it('PATCH rechaza linked_quote_ids que se vinculan a la misma cita', async () => {
    const quoteId = '55555555-5555-4555-8555-555555555555'
    mockSqlResponses.push([]) // ensureUserRow

    const res = await handler(
      new Request(`http://localhost/api/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ linked_quote_ids: [quoteId] }),
      }),
      mockContext({ id: quoteId }),
    )

    expect(res.status).toBe(400)
    expect(mockSqlResponses.calls.some((c) => /UPDATE quotes/i.test(c.template))).toBe(
      false,
    )
  })

  it('DELETE devuelve { deletedAt }', async () => {
    mockSqlResponses.push([], [{ now: '2026-05-23T12:00:00Z' }], [])
    const res = await handler(
      new Request('http://localhost/api/quotes/q1', { method: 'DELETE' }),
      mockContext({ id: 'q1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deletedAt).toBe('2026-05-23T12:00:00Z')
  })

  it('POST /:id/restore con deletedAt válido devuelve restored: true', async () => {
    mockSqlResponses.push([], [])
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
