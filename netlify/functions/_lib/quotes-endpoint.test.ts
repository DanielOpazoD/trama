import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

const embeddingMocks = vi.hoisted(() => ({
  embedSafe: vi.fn(),
  quoteEmbeddingText: vi.fn((input: unknown) => JSON.stringify(input)),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
}))

const observabilityMocks = vi.hoisted(() => ({
  logErrorEvent: vi.fn(),
}))

// Test vive en _lib/ por restricciones de naming de Netlify Functions.
// Handler en `../`, mock del db en `./db.js`.
vi.mock('./db.js', () => setupMockSql())
vi.mock('./embeddings.js', () => ({
  embedSafe: embeddingMocks.embedSafe,
  quoteEmbeddingText: embeddingMocks.quoteEmbeddingText,
  toPgVector: embeddingMocks.toPgVector,
}))
vi.mock('./observability.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./observability.js')>()),
  logErrorEvent: observabilityMocks.logErrorEvent,
}))
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
    for (const mock of Object.values(embeddingMocks)) mock.mockClear()
    observabilityMocks.logErrorEvent.mockClear()
    embeddingMocks.embedSafe.mockResolvedValue(null)
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
    ])
    const res = await handler(new Request('http://localhost/api/quotes'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toEqual(
      expect.objectContaining({ id: 'q1', entity_id: 'e1', text: 'cita test' }),
    )
    const listQuery = mockSqlResponses.calls.find((call) =>
      /FROM quotes/i.test(call.template),
    )
    expect(listQuery?.template).toMatch(/\blink\b/)
    expect(listQuery?.template).toMatch(/\bpinned_at\b/)
  })

  it('GET falla cerrado si una fila no trae la proyección canónica', async () => {
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
        pinned_at: null,
        resonance: null,
        origin: { kind: 'manual' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])

    const res = await handler(new Request('http://localhost/api/quotes'), mockContext())

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL' },
    })
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

  it('PATCH registra fallos del re-embed best-effort', async () => {
    embeddingMocks.embedSafe.mockRejectedValueOnce(new Error('embedding caído'))
    mockSqlResponses.push(
      [], // ensureUserRow
      [
        {
          text: 'cita vieja',
          source: null,
          context: null,
          entity_id: 'e1',
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          text: 'cita nueva',
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
      [{ name: 'Borges' }], // lookup de nombre para el embedding async
    )

    const res = await handler(
      new Request('http://localhost/api/quotes/q1', {
        method: 'PATCH',
        body: JSON.stringify({ text: 'cita nueva' }),
      }),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(200)
    await vi.waitFor(() => {
      expect(observabilityMocks.logErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'quote_embedding_update_failed',
          quoteId: 'q1',
          message: 'embedding caído',
        }),
      )
    })
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
    mockSqlResponses.push([], [{ deleted_at: '2026-05-23T12:00:00Z' }])
    const res = await handler(
      new Request('http://localhost/api/quotes/q1', { method: 'DELETE' }),
      mockContext({ id: 'q1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deletedAt).toBe('2026-05-23T12:00:00Z')
  })

  it('DELETE devuelve 404 si no tocó una cita del usuario', async () => {
    mockSqlResponses.push([], [])
    const res = await handler(
      new Request('http://localhost/api/quotes/q1', { method: 'DELETE' }),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('POST /:id/restore con deletedAt válido devuelve restored: true', async () => {
    mockSqlResponses.push([], [{ restored: true }])
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

  it('POST /:id/restore devuelve 404 si no restauró una cita del usuario', async () => {
    mockSqlResponses.push([], [])
    const res = await handler(
      new Request('http://localhost/api/quotes/q1/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-05-23T12:00:00Z' }),
      }),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
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
