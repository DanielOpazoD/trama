import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const {
  checkMonthlyBudget,
  resolveAIInvocation,
  askLLMForText,
  getLatestXCronica,
  selectBookmarksForCronica,
  insertXCronica,
} = vi.hoisted(() => ({
  checkMonthlyBudget: vi.fn(async () => null as Response | null),
  resolveAIInvocation: vi.fn(async () => ({
    kind: 'ready' as const,
    provider: 'openai' as string | undefined,
    model: null as string | null,
    verifyWith: null as string | null,
  })),
  askLLMForText: vi.fn(async () => ({
    content: 'Una crónica breve sobre tus bookmarks.',
    usage: {
      provider: 'openai',
      model: 'gpt',
      tokensIn: 10,
      tokensOut: 20,
      costCents: 1,
      durationMs: 5,
    },
    fromCache: false,
  })),
  getLatestXCronica: vi.fn(async () => null as unknown),
  selectBookmarksForCronica: vi.fn(async () => [] as unknown[]),
  insertXCronica: vi.fn(async () => ({
    id: 'c1',
    text: 'Una crónica breve sobre tus bookmarks.',
    source_count: 6,
    generated_at: '2026-05-30T00:00:00.000Z',
    provider: 'openai',
    model: 'gpt',
  })),
}))
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget }))
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation,
  aiOffResponse: () =>
    Response.json(
      {
        error: {
          code: 'AI_DISABLED',
          message: 'IA deshabilitada por el usuario (modo Off).',
          requestId: 'rid-test',
        },
      },
      { status: 423 },
    ),
}))
vi.mock('./llm.js', () => ({ askLLMForText }))
vi.mock('./x/index.js', () => ({
  getLatestXCronica,
  selectBookmarksForCronica,
  insertXCronica,
  buildBookmarkCronicaMessages: () => [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'usr' },
  ],
}))

import handler from '../x-cronica'

const bm = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    text: `t${i}`,
    authorUsername: 'a',
    topic: null,
  }))

describe('x-cronica endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const m of [
      checkMonthlyBudget,
      resolveAIInvocation,
      askLLMForText,
      getLatestXCronica,
      selectBookmarksForCronica,
      insertXCronica,
    ])
      m.mockClear()
    checkMonthlyBudget.mockResolvedValue(null)
    resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: null,
      verifyWith: null,
    })
    selectBookmarksForCronica.mockResolvedValue(bm(6))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve la última crónica (camelCase)', async () => {
    getLatestXCronica.mockResolvedValueOnce({
      id: 'c1',
      text: 'hola',
      source_count: 5,
      generated_at: '2026-05-30T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt',
    })
    const res = await handler(
      new Request('http://localhost/api/x/cronica'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cronica).toMatchObject({ id: 'c1', text: 'hola', sourceCount: 5 })
  })

  it('GET sin crónica → {cronica:null}', async () => {
    getLatestXCronica.mockResolvedValueOnce(null)
    const res = await handler(
      new Request('http://localhost/api/x/cronica'),
      mockContext(),
    )
    expect(await res.json()).toEqual({ cronica: null })
  })

  it('POST genera y persiste', async () => {
    const res = await handler(
      new Request('http://localhost/api/x/cronica', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cronica.text).toContain('crónica')
    expect(insertXCronica).toHaveBeenCalledOnce()
  })

  it('POST con pocos bookmarks → 422 (no llama al LLM)', async () => {
    selectBookmarksForCronica.mockResolvedValueOnce(bm(3))
    const res = await handler(
      new Request('http://localhost/api/x/cronica', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(422)
    expect(askLLMForText).not.toHaveBeenCalled()
  })

  it('POST con IA off → 423', async () => {
    resolveAIInvocation.mockResolvedValueOnce({
      kind: 'off',
    } as unknown as Awaited<ReturnType<typeof resolveAIInvocation>>)
    const res = await handler(
      new Request('http://localhost/api/x/cronica', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(423)
    expect(await res.json()).toMatchObject({ error: { code: 'AI_DISABLED' } })
    expect(insertXCronica).not.toHaveBeenCalled()
  })
})
