import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./auth.js', () => ({
  getAuthedUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: vi.fn().mockResolvedValue(null) }))
const resolveAIInvocation = vi.fn().mockResolvedValue({
  kind: 'ready',
  provider: 'deepseek',
  model: null,
  verifyWith: null,
})
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: (...args: unknown[]) => resolveAIInvocation(...args),
}))
const askLLMForJson = vi.fn()
vi.mock('./llm.js', () => ({
  askLLMForJson: (...args: unknown[]) => askLLMForJson(...args),
}))

import queryNlHandler from '../query-nl'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/query/nl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ENTITY_ROW = {
  kind: 'entity',
  id: 'e1',
  title: 'Borges',
  snippet: 'escritor',
  created_at: '2024-01-01T00:00:00Z',
  tags: [],
  cursor_val: '2024-01-01T00:00:00.000000+00',
}

beforeEach(() => {
  mockSqlResponses.reset()
  askLLMForJson.mockReset()
  resolveAIInvocation.mockResolvedValue({
    kind: 'ready',
    provider: 'deepseek',
    model: null,
    verifyWith: null,
  })
})

describe('query-nl endpoint', () => {
  it('NL → el LLM produce AST → se ejecuta y devuelve query + items (source llm)', async () => {
    askLLMForJson.mockResolvedValue({
      content: { from: ['entity'], where: { field: 'type', op: 'eq', value: 'persona' } },
      usage: {
        provider: 'deepseek',
        model: 'x',
        tokensIn: 5,
        tokensOut: 5,
        costCents: 1,
        durationMs: 9,
      },
      fromCache: false,
    })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ slug: 'persona' }, { slug: 'filosofo' }]) // entity_types
    mockSqlResponses.push([]) // extraction_log (cost accounting, fire-and-forget)
    mockSqlResponses.push([ENTITY_ROW]) // runQuery
    const res = await queryNlHandler(jsonRequest({ q: 'personas' }), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      source: string
      query: unknown
      items: unknown[]
    }
    expect(body.source).toBe('llm')
    expect(body.items).toHaveLength(1)
    expect(body.query).toMatchObject({ from: ['entity'] })
    expect(askLLMForJson).toHaveBeenCalledOnce()
    // El gasto se contabiliza en extraction_log (cost-cap mensual).
    expect(
      mockSqlResponses.calls.some((c) => c.template.includes('extraction_log')),
    ).toBe(true)
  })

  it('LLM devuelve basura → cae a fallback de texto libre (source fallback)', async () => {
    askLLMForJson.mockResolvedValue({
      content: { nope: true },
      usage: {
        provider: 'deepseek',
        model: 'x',
        tokensIn: 1,
        tokensOut: 1,
        costCents: 0,
        durationMs: 1,
      },
      fromCache: false,
    })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ slug: 'persona' }]) // entity_types
    mockSqlResponses.push([]) // extraction_log (1er intento)
    mockSqlResponses.push([]) // extraction_log (reparación)
    mockSqlResponses.push([ENTITY_ROW]) // runQuery (fallback matches)
    const res = await queryNlHandler(jsonRequest({ q: 'estoicismo' }), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { source: string; query: { where: unknown } }
    expect(body.source).toBe('fallback')
    expect(body.query.where).toEqual({ op: 'matches', value: 'estoicismo' })
  })

  it('IA off → fallback sin llamar al LLM', async () => {
    resolveAIInvocation.mockResolvedValue({ kind: 'off' })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ slug: 'persona' }]) // entity_types
    mockSqlResponses.push([ENTITY_ROW]) // runQuery
    const res = await queryNlHandler(jsonRequest({ q: 'estoicismo' }), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { source: string }
    expect(body.source).toBe('fallback')
    expect(askLLMForJson).not.toHaveBeenCalled()
  })

  it('GET no permitido → 405', async () => {
    const res = await queryNlHandler(
      new Request('http://localhost/api/query/nl'),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('body sin q → 400', async () => {
    const res = await queryNlHandler(jsonRequest({}), mockContext())
    expect(res.status).toBe(400)
  })
})
