import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const searchMocks = vi.hoisted(() => ({
  embedSafe: vi.fn(),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
  llmRerank: vi.fn(),
  resolveAIInvocation: vi.fn(),
}))

vi.mock('./embeddings.js', () => ({
  embedSafe: searchMocks.embedSafe,
  toPgVector: searchMocks.toPgVector,
}))

vi.mock('./llm-rerank.js', () => ({
  describeEntity: (entity: { name: string }) => entity.name,
  describeQuote: (quote: { text: string }) => quote.text,
  llmRerank: searchMocks.llmRerank,
}))

vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: searchMocks.resolveAIInvocation,
}))

import handler from '../search'

describe('search endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    searchMocks.embedSafe.mockReset()
    searchMocks.toPgVector.mockClear()
    searchMocks.llmRerank.mockReset()
    searchMocks.resolveAIInvocation.mockReset()
  })

  it('rechaza métodos no GET y devuelve colecciones vacías para query vacía', async () => {
    const method = await handler(
      new Request('http://localhost/api/search', { method: 'POST' }),
      mockContext(),
    )
    expect(method.status).toBe(405)

    mockSqlResponses.reset()
    const empty = await handler(
      new Request('http://localhost/api/search?q=%20'),
      mockContext(),
    )
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({
      entities: [],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
    })
    expect(mockSqlResponses.calls).toHaveLength(0)
  })

  it('rechaza modos de búsqueda desconocidos antes de consultar datos', async () => {
    const res = await handler(
      new Request('http://localhost/api/search?q=borges&mode=todo'),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'VALIDATION',
        message: 'mode debe ser uno de: hybrid, lexical, semantic',
      },
    })
    expect(
      mockSqlResponses.calls.some((call) =>
        /\bFROM\s+(entities|quotes|momentos|cronicas|chat_messages)\b/i.test(
          call.template,
        ),
      ),
    ).toBe(false)
    expect(searchMocks.embedSafe).not.toHaveBeenCalled()
  })

  it('ejecuta búsqueda léxica aislada por user_id y devuelve shapes camelCase', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'autor',
          year: 1899,
          rank: 0.9,
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          entity_name: 'Borges',
          text: 'El tiempo',
          source: 'Ensayo',
          rank: 0.8,
        },
      ],
      [
        {
          id: 'm1',
          kind: 'nota',
          captured_at: '2026-01-01',
          text: 'momento',
          rank: 0.7,
        },
      ],
      [{ id: 'c1', year: 2026, month: 5, text: 'crónica', rank: 0.6 }],
      [
        {
          id: 'cm1',
          thread_id: 't1',
          thread_title: 'Hilo',
          role: 'assistant',
          text: 'chat',
          rank: 0.5,
        },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/search?q=borges&mode=lexical&limit=2'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      entities: [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'autor',
          year: 1899,
          finalRank: 1,
          reranked: false,
        },
      ],
      quotes: [
        {
          id: 'q1',
          entityId: 'e1',
          entityName: 'Borges',
          text: 'El tiempo',
          source: 'Ensayo',
          finalRank: 1,
        },
      ],
      momentos: [{ id: 'm1', kind: 'nota', text: 'momento', capturedAt: '2026-01-01' }],
      cronicas: [{ id: 'c1', year: 2026, month: 5, text: 'crónica' }],
      chat: [
        {
          id: 'cm1',
          threadId: 't1',
          threadTitle: 'Hilo',
          role: 'assistant',
          text: 'chat',
        },
      ],
      mode: 'lexical',
      reranked: false,
    })
    expect(searchMocks.embedSafe).not.toHaveBeenCalled()
    expect(mockSqlResponses.calls).toHaveLength(5)
    for (const call of mockSqlResponses.calls) {
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
    }
  })

  it('ejecuta búsqueda semántica cuando hay embedding disponible', async () => {
    searchMocks.embedSafe.mockResolvedValue({ vector: [0.1, 0.2] })
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: null,
          year: null,
          rank: 0,
          distance: 0.1,
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          entity_name: 'Borges',
          text: 'quote',
          source: null,
          rank: 0,
          distance: 0.2,
        },
      ],
      [
        {
          id: 'm1',
          kind: 'nota',
          captured_at: '2026-01-01',
          text: 'momento',
          rank: 0,
          distance: 0.3,
        },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/search?q=memoria&mode=semantic&limit=1'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entities[0]).toMatchObject({
      id: 'e1',
      semanticRank: 1,
      lexicalRank: null,
    })
    expect(body.quotes[0]).toMatchObject({ id: 'q1', semanticRank: 1 })
    expect(body.momentos[0]).toMatchObject({ id: 'm1' })
    expect(searchMocks.embedSafe).toHaveBeenCalledWith('memoria')
    expect(searchMocks.toPgVector).toHaveBeenCalledWith([0.1, 0.2])
  })

  it('reordena candidatos con LLM rerank solo cuando se solicita', async () => {
    searchMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
    searchMocks.llmRerank
      .mockResolvedValueOnce(['e2', 'e1'])
      .mockResolvedValueOnce(['q2', 'q1'])
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          name: 'A',
          type: 'persona',
          description: null,
          year: null,
          rank: 0.9,
        },
        {
          id: 'e2',
          name: 'B',
          type: 'persona',
          description: null,
          year: null,
          rank: 0.8,
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          entity_name: 'A',
          text: 'uno',
          source: null,
          rank: 0.9,
        },
        {
          id: 'q2',
          entity_id: 'e2',
          entity_name: 'B',
          text: 'dos',
          source: null,
          rank: 0.8,
        },
      ],
      [],
      [],
      [],
    )

    const res = await handler(
      new Request('http://localhost/api/search?q=algo&mode=lexical&rerank=true&limit=2'),
      mockContext(),
    )

    const body = await res.json()
    expect(body.entities.map((e: { id: string }) => e.id)).toEqual(['e2', 'e1'])
    expect(body.quotes.map((q: { id: string }) => q.id)).toEqual(['q2', 'q1'])
    expect(body.reranked).toBe(true)
    expect(searchMocks.resolveAIInvocation).toHaveBeenCalledWith(
      expect.any(Request),
      'chat',
      'legacy-single-user',
    )
    expect(searchMocks.llmRerank).toHaveBeenCalledTimes(2)
  })
})
