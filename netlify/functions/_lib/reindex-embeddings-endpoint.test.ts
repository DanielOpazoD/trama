import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const embeddingMocks = vi.hoisted(() => ({
  embedSafe: vi.fn(),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
  entityEmbeddingText: vi.fn((entity: { name: string }) => `entity:${entity.name}`),
  quoteEmbeddingText: vi.fn((quote: { text: string }) => `quote:${quote.text}`),
}))

vi.mock('./embeddings.js', () => ({
  embedSafe: embeddingMocks.embedSafe,
  toPgVector: embeddingMocks.toPgVector,
  entityEmbeddingText: embeddingMocks.entityEmbeddingText,
  quoteEmbeddingText: embeddingMocks.quoteEmbeddingText,
}))

import handler from '../reindex-embeddings'

describe('reindex-embeddings endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(embeddingMocks)) mock.mockClear()
  })

  it('GET devuelve conteos pendientes aislados por user_id', async () => {
    mockSqlResponses.push([{ c: '3' }], [{ c: '5' }])

    const res = await handler(
      new Request('http://localhost/api/reindex-embeddings'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entities: 3, quotes: 5 })
    expect(mockSqlState.calls).toHaveLength(2)
    for (const call of mockSqlState.calls) {
      expect(call.template).toMatch(/deleted_at IS NULL/)
      expect(call.template).toMatch(/embedding IS NULL/)
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
    }
  })

  it('rechaza métodos no soportados y normaliza batch para POST', async () => {
    const method = await handler(
      new Request('http://localhost/api/reindex-embeddings', { method: 'PUT' }),
      mockContext(),
    )
    expect(method.status).toBe(405)

    mockSqlResponses.reset()
    mockSqlResponses.push([], [], [], [{ c: '0' }], [{ c: '0' }])
    const post = await handler(
      new Request('http://localhost/api/reindex-embeddings?batch=999', {
        method: 'POST',
      }),
      mockContext(),
    )
    expect(post.status).toBe(200)
    expect(await post.json()).toEqual({
      processed: 0,
      remaining: { entities: 0, quotes: 0 },
      errors: [],
    })
    expect(mockSqlState.calls.some((call) => call.values.includes(100))).toBe(true)
  })

  it('procesa entidades primero, usa capacidad restante para citas y reporta errores', async () => {
    embeddingMocks.embedSafe
      .mockResolvedValueOnce({ vector: [0.1, 0.2], model: 'embed' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ vector: [0.3, 0.4], model: 'embed' })
    mockSqlResponses.push(
      [],
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          year: 1899,
          description: 'autor',
        },
        {
          id: 'e2',
          name: 'Proust',
          type: 'persona',
          year: 1871,
          description: null,
        },
      ],
      [],
      [
        {
          id: 'q1',
          text: 'El tiempo',
          source: 'Ensayo',
          context: null,
          entity_name: 'Borges',
        },
      ],
      [],
      [{ c: '1' }],
      [{ c: '0' }],
    )

    const res = await handler(
      new Request('http://localhost/api/reindex-embeddings?batch=2', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      processed: 2,
      remaining: { entities: 1, quotes: 0 },
      errors: [{ kind: 'entity', id: 'e2', reason: 'embedding falló' }],
    })
    expect(embeddingMocks.entityEmbeddingText).toHaveBeenCalledTimes(2)
    expect(embeddingMocks.quoteEmbeddingText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'El tiempo', entityName: 'Borges' }),
    )
    expect(embeddingMocks.toPgVector).toHaveBeenCalledWith([0.1, 0.2])
    expect(embeddingMocks.toPgVector).toHaveBeenCalledWith([0.3, 0.4])
    const updates = mockSqlState.calls.filter((call) =>
      /^UPDATE (entities|quotes)/i.test(call.template.trim()),
    )
    expect(updates).toHaveLength(2)
    for (const call of updates) {
      expect(call.template).toMatch(/deleted_at IS NULL/)
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
    }
  })
})
