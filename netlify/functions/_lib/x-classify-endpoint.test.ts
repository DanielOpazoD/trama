import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// La lógica de clasificación (LLM + DB) se prueba aparte; acá verificamos el
// glue del endpoint: método, modo off, cost-cap y el shape de respuesta.
const { checkMonthlyBudget, resolveAIInvocation, runClassify } = vi.hoisted(() => ({
  checkMonthlyBudget: vi.fn(async () => null as Response | null),
  resolveAIInvocation: vi.fn(async () => ({
    kind: 'ready' as const,
    provider: 'openai' as string | undefined,
    model: null as string | null,
    verifyWith: null as string | null,
  })),
  runClassify: vi.fn(async () => ({ classified: 3, remaining: false })),
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
vi.mock('./x/index.js', () => ({ runClassify }))

import handler from '../x-classify'

describe('x-classify endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    checkMonthlyBudget.mockClear()
    resolveAIInvocation.mockClear()
    runClassify.mockClear()
    checkMonthlyBudget.mockResolvedValue(null)
    resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: null,
      verifyWith: null,
    })
    runClassify.mockResolvedValue({ classified: 3, remaining: false })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('método no POST devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/x/classify'),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('clasifica y devuelve {classified, remaining}', async () => {
    const res = await handler(
      new Request('http://localhost/api/x/classify', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ classified: 3, remaining: false })
    expect(runClassify).toHaveBeenCalledOnce()
  })

  it('modo IA off → 423 (no llama al clasificador)', async () => {
    resolveAIInvocation.mockResolvedValueOnce({
      kind: 'off',
    } as unknown as Awaited<ReturnType<typeof resolveAIInvocation>>)
    const res = await handler(
      new Request('http://localhost/api/x/classify', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(423)
    expect(await res.json()).toMatchObject({ error: { code: 'AI_DISABLED' } })
    expect(runClassify).not.toHaveBeenCalled()
  })

  it('presupuesto agotado → corta antes de clasificar', async () => {
    checkMonthlyBudget.mockResolvedValueOnce(new Response('budget', { status: 429 }))
    const res = await handler(
      new Request('http://localhost/api/x/classify', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(429)
    expect(runClassify).not.toHaveBeenCalled()
  })
})
