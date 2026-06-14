import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./auth.js', () => ({
  getAuthedUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))
const checkMonthlyBudget = vi.fn().mockResolvedValue(null)
vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: (...args: unknown[]) => checkMonthlyBudget(...args),
}))
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
  checkMonthlyBudget.mockResolvedValue(null)
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

  it('IA off → fallback sin llamar al LLM (ni fetch del catálogo)', async () => {
    resolveAIInvocation.mockResolvedValue({ kind: 'off' })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([ENTITY_ROW]) // runQuery
    const res = await queryNlHandler(jsonRequest({ q: 'estoicismo' }), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { source: string }
    expect(body.source).toBe('fallback')
    expect(askLLMForJson).not.toHaveBeenCalled()
    // El catálogo (entity_types) sólo se consulta si vamos a invocar al LLM.
    expect(mockSqlResponses.calls.some((c) => c.template.includes('entity_types'))).toBe(
      false,
    )
  })

  it('sin presupuesto → degrada a fallback sin LLM (no 429)', async () => {
    // checkMonthlyBudget devuelve un Response 429; el endpoint lo descarta a
    // propósito y cae a búsqueda de texto libre (degradación elegante).
    checkMonthlyBudget.mockResolvedValue(new Response('over', { status: 429 }))
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([ENTITY_ROW]) // runQuery
    const res = await queryNlHandler(jsonRequest({ q: 'estoicismo' }), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { source: string }
    expect(body.source).toBe('fallback')
    expect(askLLMForJson).not.toHaveBeenCalled()
    // El catálogo (entity_types) sólo se consulta si vamos a invocar al LLM.
    expect(mockSqlResponses.calls.some((c) => c.template.includes('entity_types'))).toBe(
      false,
    )
    expect(
      mockSqlResponses.calls.some((c) => c.template.includes('extraction_log')),
    ).toBe(false)
  })

  it('cache hit → extraction_log contabiliza cost_cents 0', async () => {
    askLLMForJson.mockResolvedValue({
      content: { from: ['entity'], where: { field: 'type', op: 'eq', value: 'persona' } },
      usage: {
        provider: 'deepseek',
        model: 'x',
        tokensIn: 5,
        tokensOut: 5,
        costCents: 7, // costo "real", pero al venir de cache se factura 0
        durationMs: 9,
      },
      fromCache: true,
    })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ slug: 'persona' }]) // entity_types
    mockSqlResponses.push([]) // extraction_log
    mockSqlResponses.push([ENTITY_ROW]) // runQuery
    await queryNlHandler(jsonRequest({ q: 'personas' }), mockContext())
    const logCall = mockSqlResponses.calls.find((c) =>
      c.template.includes('extraction_log'),
    )
    expect(logCall).toBeDefined()
    // Orden de values: input_text, proposal, provider, model, tokens_in,
    // tokens_out, cost_cents, duration_ms, user_id → cost_cents es el índice 6.
    expect(logCall?.values[6]).toBe(0)
  })

  it('LLM da AST Zod-válido pero no compilable → repara y cae a fallback', async () => {
    // `type` es texto y no admite `lt`: pasa Zod pero el compilador lo rechaza.
    // El traductor reintenta una vez; si el reintento repite el error, fallback.
    askLLMForJson.mockResolvedValue({
      content: { from: ['entity'], where: { field: 'type', op: 'lt', value: 'x' } },
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
    const res = await queryNlHandler(jsonRequest({ q: 'algo raro' }), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { source: string; query: { where: unknown } }
    expect(body.source).toBe('fallback')
    expect(body.query.where).toEqual({ op: 'matches', value: 'algo raro' })
    expect(askLLMForJson).toHaveBeenCalledTimes(2) // intento + reparación
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
