import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const askMocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
  buildRagContext: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForJson: askMocks.askLLMForJson,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: askMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: askMocks.checkMonthlyBudget,
}))

vi.mock('./rag-context.js', () => ({
  buildRagContext: askMocks.buildRagContext,
}))

import handler from '../ask'

const usage = {
  provider: 'openai',
  model: 'gpt',
  tokensIn: 30,
  tokensOut: 12,
  costCents: 1.8,
  durationMs: 80,
}

const ragContext = {
  entities: [
    {
      id: 'e1',
      name: 'Borges',
      type: 'persona',
      year: 1899,
      description: 'autor',
    },
  ],
  relationships: [
    {
      id: 'r1',
      from_name: 'Borges',
      to_name: 'Proust',
      type: 'responde_a',
    },
  ],
  quotes: [
    {
      id: 'q1',
      entity_name: 'Borges',
      text: 'El tiempo es un río.',
      source: 'Ensayo',
    },
  ],
  usedRag: true,
  usedHyde: true,
}

describe('ask endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(askMocks)) mock.mockReset()
    askMocks.checkMonthlyBudget.mockResolvedValue(null)
    askMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
    askMocks.buildRagContext.mockResolvedValue(ragContext)
    askMocks.askLLMForJson.mockResolvedValue({
      content: { reply: '  Respuesta con contexto.  ', proposal: {} },
      usage,
      fromCache: false,
    })
  })

  it('valida método, JSON y texto vacío con errores canónicos', async () => {
    const method = await handler(new Request('http://localhost/api/ask'), mockContext())
    expect(method.status).toBe(405)

    const invalidJson = await handler(
      new Request('http://localhost/api/ask', { method: 'POST', body: '{' }),
      mockContext(),
    )
    expect(invalidJson.status).toBe(400)

    const blankText = await handler(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        body: JSON.stringify({ text: '   ' }),
      }),
      mockContext(),
    )
    expect(blankText.status).toBe(400)
    expect(await blankText.json()).toMatchObject({
      error: { code: 'VALIDATION', message: 'Falta el campo "text"' },
    })
  })

  it('respeta cost cap y modo IA off antes de construir contexto RAG', async () => {
    askMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    mockSqlResponses.push([])

    const budget = await handler(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        body: JSON.stringify({ text: 'Qué tengo sobre Borges?' }),
      }),
      mockContext(),
    )
    expect(budget.status).toBe(429)
    expect(askMocks.buildRagContext).not.toHaveBeenCalled()

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    askMocks.checkMonthlyBudget.mockResolvedValueOnce(null)
    askMocks.resolveAIInvocation.mockResolvedValueOnce({ kind: 'off' })

    const off = await handler(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        body: JSON.stringify({ text: 'Qué tengo sobre Borges?' }),
      }),
      mockContext(),
    )

    expect(off.status).toBe(423)
    expect(askMocks.buildRagContext).not.toHaveBeenCalled()
  })

  it('rechaza thread inexistente sin llamar al LLM', async () => {
    mockSqlResponses.push([], [])

    const res = await handler(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        body: JSON.stringify({ text: 'Sigue', threadId: 't-missing' }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Thread no encontrado' },
    })
    expect(askMocks.askLLMForJson).not.toHaveBeenCalled()
  })

  it('genera respuesta con RAG, crea thread de vista válida y persiste el turno', async () => {
    mockSqlResponses.push(
      [],
      [{ slug: 'persona' }],
      [{ slug: 'responde_a' }],
      [{ id: 'e1', name: 'Borges', type: 'persona', description: 'autor' }],
      [],
      [{ id: 't-new' }],
      [],
      [],
      [],
    )

    const res = await handler(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        body: JSON.stringify({
          text: 'Qué conecta Borges con el tiempo?',
          view: 'grafo',
          selectedEntityId: 'e1',
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      reply: 'Respuesta con contexto.',
      proposal: null,
      provider: 'openai',
      model: 'gpt',
      threadId: 't-new',
    })
    expect(askMocks.buildRagContext).toHaveBeenCalledWith(
      expect.any(Function),
      'Qué conecta Borges con el tiempo?',
      'legacy-single-user',
      expect.objectContaining({
        relationshipLimit: 100,
        rerank: true,
        rerankOverride: { provider: 'openai', model: 'gpt' },
        hyde: true,
      }),
    )
    expect(askMocks.askLLMForJson).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      { provider: 'openai', model: 'gpt' },
    )
    const templates = mockSqlState.calls.map((call) => call.template).join('\n')
    expect(templates).toMatch(/INSERT INTO extraction_log/)
    expect(templates).toMatch(/INSERT INTO chat_threads/)
    expect(templates).toMatch(/INSERT INTO chat_messages/)
    expect(templates).toMatch(/UPDATE chat_threads SET updated_at/)
    expect(mockSqlState.calls.flatMap((call) => call.values)).toEqual(
      expect.arrayContaining(['legacy-single-user', 'grafo', 't-new']),
    )
  })

  it('reutiliza historial existente en orden cronológico y propaga fallas LLM como upstream', async () => {
    mockSqlResponses.push(
      [],
      [{ id: 't1' }],
      [
        { role: 'assistant', content: 'Respuesta anterior' },
        { role: 'user', content: 'Pregunta anterior' },
      ],
      [{ slug: 'persona' }],
      [{ slug: 'responde_a' }],
    )
    askMocks.askLLMForJson.mockRejectedValueOnce(new Error('timeout'))

    const res = await handler(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        body: JSON.stringify({ text: 'Continúa', threadId: 't1', view: 'no-valida' }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({
      error: { code: 'UPSTREAM', message: 'Error llamando al LLM: timeout' },
    })
    const prompt = askMocks.askLLMForJson.mock.calls[0]?.[0] as Array<{ content: string }>
    expect(prompt.map((message) => message.content).join('\n')).toContain(
      'Pregunta anterior',
    )
    expect(prompt.map((message) => message.content).join('\n')).toContain(
      'Respuesta anterior',
    )
  })
})
