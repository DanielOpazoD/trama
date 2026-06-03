import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const mocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
}))

vi.mock('./llm.js', () => ({ askLLMForJson: mocks.askLLMForJson }))
vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return { ...actual, resolveAIInvocation: mocks.resolveAIInvocation }
})
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: mocks.checkMonthlyBudget }))

import handler from '../extract'

/**
 * Contabilidad de costos del extract: un cache hit NO debe re-cobrar el
 * presupuesto. `checkMonthlyBudget` suma `extraction_log.cost_cents`, así que
 * registrar el costo original en cada hit lo inflaba. Cubrimos que en cache hit
 * el cost_cents logueado sea 0 (tokens intactos) y en llamada real sea el real.
 */
const baseUsage = {
  provider: 'openai',
  model: 'gpt-test',
  tokensIn: 44,
  tokensOut: 18,
  costCents: 3.1,
  durationMs: 120,
}

function extractRequest() {
  return new Request('http://localhost/api/extract', {
    method: 'POST',
    body: JSON.stringify({ text: 'una nota sobre Borges' }),
  })
}

/** Índices de los valores bindeados del INSERT extraction_log (orden del VALUES). */
const COST_CENTS = 6
const TOKENS_IN = 4

describe('extract — contabilidad de costos (cache hit)', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.checkMonthlyBudget.mockResolvedValue(null)
    mocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt-test',
      verifyWith: null,
    })
    // ensureUserRow + 3 catálogos (vacíos → fallback) + INSERT extraction_log.
    mockSqlResponses.push([], [], [], [], [])
  })

  it('cache hit → cost_cents 0 (no re-cobra el presupuesto), tokens intactos', async () => {
    mocks.askLLMForJson.mockResolvedValue({
      content: { entities: [], relationships: [], quotes: [] },
      usage: baseUsage,
      fromCache: true,
    })

    const res = await handler(extractRequest(), mockContext())
    expect(res.status).toBe(200)

    const log = mockSqlState.calls.find((c) =>
      /INSERT INTO extraction_log/i.test(c.template),
    )
    expect(log).toBeDefined()
    // Costo en 0 (no se pagó nada), pero los tokens del payload cacheado se mantienen.
    expect(log?.values[COST_CENTS]).toBe(0)
    expect(log?.values[TOKENS_IN]).toBe(44)
  })

  it('llamada real (no cache) → registra el cost_cents real', async () => {
    mocks.askLLMForJson.mockResolvedValue({
      content: { entities: [], relationships: [], quotes: [] },
      usage: baseUsage,
      fromCache: false,
    })

    const res = await handler(extractRequest(), mockContext())
    expect(res.status).toBe(200)

    const log = mockSqlState.calls.find((c) =>
      /INSERT INTO extraction_log/i.test(c.template),
    )
    expect(log?.values[COST_CENTS]).toBe(3.1)
  })
})
