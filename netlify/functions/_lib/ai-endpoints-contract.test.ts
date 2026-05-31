import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const aiMocks = vi.hoisted(() => ({
  askLLMForText: vi.fn(),
  askLLMForJson: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
  crossVerify: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForText: aiMocks.askLLMForText,
  askLLMForJson: aiMocks.askLLMForJson,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: aiMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: aiMocks.checkMonthlyBudget,
}))

vi.mock('./cross-verify.js', () => ({
  crossVerify: aiMocks.crossVerify,
}))

import quoteReflectHandler from '../quote-reflect'
import reclassifyHandler from '../reclassify-entities'

const usage = {
  provider: 'openai',
  model: 'gpt',
  tokensIn: 10,
  tokensOut: 5,
  costCents: 1.25,
  durationMs: 30,
}

describe('quote-reflect endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(aiMocks)) mock.mockReset()
    aiMocks.checkMonthlyBudget.mockResolvedValue(null)
    aiMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
  })

  it('valida método/id, presupuesto y not found', async () => {
    const method = await quoteReflectHandler(
      new Request('http://localhost/api/quotes/q1/reflect'),
      mockContext({ id: 'q1' }),
    )
    expect(method.status).toBe(405)

    const missing = await quoteReflectHandler(
      new Request('http://localhost/api/quotes//reflect', { method: 'POST' }),
      mockContext(),
    )
    expect(missing.status).toBe(400)

    aiMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    mockSqlResponses.push([])
    const budget = await quoteReflectHandler(
      new Request('http://localhost/api/quotes/q1/reflect', { method: 'POST' }),
      mockContext({ id: 'q1' }),
    )
    expect(budget.status).toBe(429)

    mockSqlResponses.reset()
    mockSqlResponses.push([], [])
    const notFound = await quoteReflectHandler(
      new Request('http://localhost/api/quotes/q1/reflect', { method: 'POST' }),
      mockContext({ id: 'q1' }),
    )
    expect(notFound.status).toBe(404)
  })

  it('genera reflexión con vecinos semánticos y loguea extracción', async () => {
    mockSqlResponses.push(
      [],
      [
        {
          text: 'El tiempo es un río.',
          source: 'Ensayo',
          context: 'nota',
          user_reflection: 'propia',
          embedding: '[1,2,3]',
          entity_name: 'Borges',
          entity_type: 'persona',
          entity_description: 'autor',
        },
      ],
      [{ text: 'Otro tiempo.', entity_name: 'Proust' }],
      [],
    )
    aiMocks.askLLMForText.mockResolvedValue({
      content: '  reflexión limpia  ',
      usage,
      fromCache: false,
    })

    const res = await quoteReflectHandler(
      new Request('http://localhost/api/quotes/q1/reflect', { method: 'POST' }),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      reflection: 'reflexión limpia',
      provider: 'openai',
      model: 'gpt',
    })
    expect(aiMocks.askLLMForText).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      { provider: 'openai', model: 'gpt' },
    )
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO extraction_log/i.test(c.template)),
    ).toBe(true)
  })

  it('respeta modo IA off y traduce fallas LLM a upstream', async () => {
    mockSqlResponses.push(
      [],
      [
        {
          text: 'Texto',
          source: null,
          context: null,
          user_reflection: null,
          embedding: null,
          entity_name: 'Borges',
          entity_type: 'persona',
          entity_description: null,
        },
      ],
    )
    aiMocks.resolveAIInvocation.mockResolvedValueOnce({ kind: 'off' })
    const off = await quoteReflectHandler(
      new Request('http://localhost/api/quotes/q1/reflect', { method: 'POST' }),
      mockContext({ id: 'q1' }),
    )
    expect(off.status).toBe(423)

    mockSqlResponses.reset()
    mockSqlResponses.push(
      [],
      [
        {
          text: 'Texto',
          source: null,
          context: null,
          user_reflection: null,
          embedding: null,
          entity_name: 'Borges',
          entity_type: 'persona',
          entity_description: null,
        },
      ],
    )
    aiMocks.askLLMForText.mockRejectedValueOnce(new Error('timeout'))
    const upstream = await quoteReflectHandler(
      new Request('http://localhost/api/quotes/q1/reflect', { method: 'POST' }),
      mockContext({ id: 'q1' }),
    )
    expect(upstream.status).toBe(502)
  })
})

describe('reclassify-entities endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(aiMocks)) mock.mockReset()
    aiMocks.checkMonthlyBudget.mockResolvedValue(null)
    aiMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
  })

  it('valida método y devuelve vacío sin entidades o tipos', async () => {
    const method = await reclassifyHandler(
      new Request('http://localhost/api/reclassify-entities'),
      mockContext(),
    )
    expect(method.status).toBe(405)

    mockSqlResponses.push([], [], [], [])
    const empty = await reclassifyHandler(
      new Request('http://localhost/api/reclassify-entities', { method: 'POST' }),
      mockContext(),
    )
    expect(await empty.json()).toEqual({ reclassifications: [] })
    expect(aiMocks.askLLMForJson).not.toHaveBeenCalled()
  })

  it('genera reclasificaciones válidas y verificación cruzada cuando está configurada', async () => {
    mockSqlResponses.push(
      [],
      [
        {
          id: 'e1',
          name: 'Kind of Blue',
          type: 'concepto',
          year: 1959,
          description: 'disco',
        },
      ],
      [{ entity_id: 'e1', text: 'Miles Davis' }],
      [
        { slug: 'concepto', label: 'Concepto' },
        { slug: 'album', label: 'Álbum' },
      ],
      [],
    )
    aiMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: 'gemini',
    })
    aiMocks.askLLMForJson.mockResolvedValue({
      content: {
        reclassifications: [
          { id: 'e1', newType: 'album', reason: 'Es un disco' },
          { id: 'missing', newType: 'album' },
        ],
      },
      usage,
      fromCache: false,
    })
    aiMocks.crossVerify.mockResolvedValue({
      verdictsByIndex: new Map([[0, { agreed: false, note: 'Revisar' }]]),
      usage: { ...usage, costCents: 0.5 },
    })

    const res = await reclassifyHandler(
      new Request('http://localhost/api/reclassify-entities', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      reclassifications: [
        {
          id: 'e1',
          oldType: 'concepto',
          newType: 'album',
          reason: 'Es un disco',
          name: 'Kind of Blue',
          verification: { agreed: false, note: 'Revisar', verifier: 'gemini' },
        },
      ],
      verifierProvider: 'gemini',
    })
    expect(aiMocks.crossVerify).toHaveBeenCalledOnce()
  })

  it('respeta modo off y registra errores upstream', async () => {
    mockSqlResponses.push(
      [],
      [{ id: 'e1', name: 'Borges', type: 'persona', year: null, description: null }],
      [],
      [{ slug: 'persona', label: 'Persona' }],
    )
    aiMocks.resolveAIInvocation.mockResolvedValueOnce({ kind: 'off' })
    const off = await reclassifyHandler(
      new Request('http://localhost/api/reclassify-entities', { method: 'POST' }),
      mockContext(),
    )
    expect(off.status).toBe(423)

    mockSqlResponses.reset()
    mockSqlResponses.push(
      [],
      [{ id: 'e1', name: 'Borges', type: 'persona', year: null, description: null }],
      [],
      [{ slug: 'obra', label: 'Obra' }],
      [],
    )
    aiMocks.askLLMForJson.mockRejectedValueOnce(new Error('falló'))
    const upstream = await reclassifyHandler(
      new Request('http://localhost/api/reclassify-entities', { method: 'POST' }),
      mockContext(),
    )
    expect(upstream.status).toBe(502)
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO extraction_log/i.test(c.template)),
    ).toBe(true)
  })
})
