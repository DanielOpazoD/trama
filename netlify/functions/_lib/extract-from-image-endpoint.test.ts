import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const imageMocks = vi.hoisted(() => ({
  askLLMForVision: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForVision: imageMocks.askLLMForVision,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: imageMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: imageMocks.checkMonthlyBudget,
}))

import handler from '../extract-from-image'

const usage = {
  provider: 'openai',
  model: 'gpt-vision',
  tokensIn: 44,
  tokensOut: 18,
  costCents: 3.1,
  durationMs: 140,
}

function imageRequest(body: unknown) {
  return new Request('http://localhost/api/extract-from-image', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('extract-from-image endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(imageMocks)) mock.mockReset()
    imageMocks.checkMonthlyBudget.mockResolvedValue(null)
    imageMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt-vision',
      verifyWith: null,
    })
    imageMocks.askLLMForVision.mockResolvedValue({
      content: {
        entities: [{ type: 'persona', name: 'Borges' }],
        relationships: [{ fromName: 'Borges', toName: 'Tiempo', type: 'asociado_con' }],
        quotes: [{ entityName: 'Borges', text: 'El tiempo' }],
      },
      usage,
      fromCache: false,
    })
  })

  it('rechaza método y body inválido con ApiErrors', async () => {
    const method = await handler(
      new Request('http://localhost/api/extract-from-image'),
      mockContext(),
    )
    expect(method.status).toBe(405)

    mockSqlResponses.push([])
    const invalid = await handler(
      new Request('http://localhost/api/extract-from-image', {
        method: 'POST',
        body: '{',
      }),
      mockContext(),
    )
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('respeta presupuesto antes de parsear imagen y no llama al LLM', async () => {
    imageMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    mockSqlResponses.push([])

    const res = await handler(
      imageRequest({ imageBase64: 'abc', mimeType: 'image/png' }),
      mockContext(),
    )

    expect(res.status).toBe(429)
    expect(imageMocks.askLLMForVision).not.toHaveBeenCalled()
  })

  it('valida mime y tamaño antes de resolver proveedor IA', async () => {
    mockSqlResponses.push([])
    const mime = await handler(
      imageRequest({ imageBase64: 'abc', mimeType: 'text/plain' }),
      mockContext(),
    )
    expect(mime.status).toBe(415)

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    const tooLarge = await handler(
      imageRequest({ imageBase64: 'a'.repeat(12 * 1024 * 1024), mimeType: 'image/png' }),
      mockContext(),
    )
    expect(tooLarge.status).toBe(413)
    expect(imageMocks.resolveAIInvocation).not.toHaveBeenCalled()
  })

  it('respeta modo IA off después de cargar catálogos de tipos', async () => {
    imageMocks.resolveAIInvocation.mockResolvedValueOnce({ kind: 'off' })
    mockSqlResponses.push([], [{ slug: 'persona' }], [{ slug: 'asociado_con' }])

    const res = await handler(
      imageRequest({ imageBase64: 'abc', mimeType: 'image/png' }),
      mockContext(),
    )

    expect(res.status).toBe(423)
    expect(imageMocks.askLLMForVision).not.toHaveBeenCalled()
  })

  it('extrae propuesta limpia con LLM de visión y registra extraction_log', async () => {
    mockSqlResponses.push(
      [],
      [{ slug: 'persona' }, { slug: 'concepto' }],
      [{ slug: 'asociado_con' }],
      [],
    )

    const res = await handler(
      imageRequest({ imageBase64: 'abc123', mimeType: 'image/png' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entities: [{ type: 'persona', name: 'Borges' }],
      relationships: [{ fromName: 'Borges', toName: 'Tiempo', type: 'asociado_con' }],
      quotes: [{ entityName: 'Borges', text: 'El tiempo' }],
      edits: [],
      deletes: [],
      provider: 'openai',
      model: 'gpt-vision',
    })
    expect(imageMocks.askLLMForVision).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'abc123',
      'image/png',
      { provider: 'openai', model: 'gpt-vision' },
    )
    const logCall = mockSqlState.calls.find((call) =>
      /INSERT INTO extraction_log/i.test(call.template),
    )
    expect(logCall?.values).toEqual(
      expect.arrayContaining([
        'image:image/png',
        'openai',
        'gpt-vision',
        'legacy-single-user',
      ]),
    )
  })

  it('registra fallas de visión y devuelve upstream canónico', async () => {
    imageMocks.askLLMForVision.mockRejectedValueOnce(new Error('vision timeout'))
    mockSqlResponses.push([], [{ slug: 'persona' }], [{ slug: 'asociado_con' }], [])

    const res = await handler(
      imageRequest({ imageBase64: 'abc123', mimeType: 'image/png' }),
      mockContext(),
    )

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'UPSTREAM',
        message: 'Error llamando al LLM de visión: vision timeout',
      },
    })
    const failureLog = mockSqlState.calls.find((call) =>
      /INSERT INTO extraction_log \(input_text, proposal, provider, model, error, user_id\)/i.test(
        call.template,
      ),
    )
    expect(failureLog?.values).toEqual(
      expect.arrayContaining(['image:image/png', 'vision timeout', 'legacy-single-user']),
    )
  })
})
