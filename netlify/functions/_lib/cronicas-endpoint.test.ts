import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const cronicasMocks = vi.hoisted(() => ({
  askLLMForText: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForText: cronicasMocks.askLLMForText,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: cronicasMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: cronicasMocks.checkMonthlyBudget,
}))

import handler from '../cronicas'

const usage = {
  provider: 'openai',
  model: 'gpt',
  tokensIn: 40,
  tokensOut: 25,
  costCents: 2.2,
  durationMs: 120,
}

const cronicaRow = {
  id: 'c1',
  year: 2026,
  month: 5,
  text: 'Mayo abrió una trama de lecturas.',
  source_entity_ids: ['e1', 'e2'],
  generated_at: '2026-05-31T12:00:00.000Z',
  provider: 'openai',
  model: 'gpt',
}

describe('cronicas endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(cronicasMocks)) mock.mockReset()
    cronicasMocks.checkMonthlyBudget.mockResolvedValue(null)
    cronicasMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
    cronicasMocks.askLLMForText.mockResolvedValue({
      content: '  Crónica nueva del mes.  ',
      usage,
      fromCache: false,
    })
  })

  it('lista crónicas del usuario en shape camelCase', async () => {
    mockSqlResponses.push([cronicaRow])

    const res = await handler(new Request('http://localhost/api/cronicas'), mockContext())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      {
        id: 'c1',
        year: 2026,
        month: 5,
        text: 'Mayo abrió una trama de lecturas.',
        sourceEntityIds: ['e1', 'e2'],
        generatedAt: '2026-05-31T12:00:00.000Z',
        provider: 'openai',
        model: 'gpt',
      },
    ])
    expect(mockSqlState.calls[0]?.template).toMatch(/WHERE user_id/)
    expect(mockSqlState.calls[0]?.values).toContain('legacy-single-user')
  })

  it('valida body y método con errores canónicos', async () => {
    const invalidBody = await handler(
      new Request('http://localhost/api/cronicas/generate', {
        method: 'POST',
        body: JSON.stringify({ year: 1999, month: 13 }),
      }),
      mockContext(),
    )
    expect(invalidBody.status).toBe(400)

    const method = await handler(
      new Request('http://localhost/api/cronicas/generate', { method: 'PUT' }),
      mockContext(),
    )
    expect(method.status).toBe(405)
    expect(await method.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } })
  })

  it('devuelve la crónica existente sin gastar presupuesto ni llamar al LLM', async () => {
    mockSqlResponses.push([], [cronicaRow])

    const res = await handler(
      new Request('http://localhost/api/cronicas/generate', {
        method: 'POST',
        body: JSON.stringify({ year: 2026, month: 5 }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: 'c1',
      year: 2026,
      month: 5,
      text: 'Mayo abrió una trama de lecturas.',
      sourceEntityIds: ['e1', 'e2'],
      generatedAt: '2026-05-31T12:00:00.000Z',
      provider: 'openai',
      model: 'gpt',
      alreadyExisted: true,
    })
    expect(cronicasMocks.checkMonthlyBudget).not.toHaveBeenCalled()
    expect(cronicasMocks.askLLMForText).not.toHaveBeenCalled()
  })

  it('devuelve 422 editorial cuando el mes no tiene actividad suficiente', async () => {
    mockSqlResponses.push([], [], [])

    const res = await handler(
      new Request('http://localhost/api/cronicas/generate', {
        method: 'POST',
        body: JSON.stringify({ year: 2026, month: 2 }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'UNPROCESSABLE',
        message:
          'No hay actividad suficiente en febrero de 2026 para escribir una crónica.',
      },
    })
    expect(cronicasMocks.askLLMForText).not.toHaveBeenCalled()
  })

  it('respeta presupuesto y modo IA off antes de generar texto', async () => {
    cronicasMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    mockSqlResponses.push(
      [],
      [],
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'autor',
          year: 1899,
          quote_count: 2,
          rel_count: 1,
        },
      ],
      [{ entity_id: 'e1', text: 'El tiempo', source: 'Ensayo' }],
    )

    const budget = await handler(
      new Request('http://localhost/api/cronicas/generate', {
        method: 'POST',
        body: JSON.stringify({ year: 2026, month: 5 }),
      }),
      mockContext(),
    )
    expect(budget.status).toBe(429)
    expect(cronicasMocks.askLLMForText).not.toHaveBeenCalled()

    mockSqlResponses.reset()
    cronicasMocks.checkMonthlyBudget.mockResolvedValueOnce(null)
    cronicasMocks.resolveAIInvocation.mockResolvedValueOnce({ kind: 'off' })
    mockSqlResponses.push(
      [],
      [],
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'autor',
          year: 1899,
          quote_count: 2,
          rel_count: 1,
        },
      ],
      [{ entity_id: 'e1', text: 'El tiempo', source: 'Ensayo' }],
    )

    const off = await handler(
      new Request('http://localhost/api/cronicas/generate', {
        method: 'POST',
        body: JSON.stringify({ year: 2026, month: 5 }),
      }),
      mockContext(),
    )
    expect(off.status).toBe(423)
    expect(cronicasMocks.askLLMForText).not.toHaveBeenCalled()
  })

  it('genera crónica, registra observabilidad y persiste snapshot idempotente', async () => {
    mockSqlResponses.push(
      [],
      [],
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'autor',
          year: 1899,
          quote_count: 2,
          rel_count: 1,
        },
        {
          id: 'e2',
          name: 'Proust',
          type: 'persona',
          description: null,
          year: 1871,
          quote_count: 1,
          rel_count: 0,
        },
      ],
      [
        { entity_id: 'e1', text: 'El tiempo', source: 'Ensayo' },
        { entity_id: 'e2', text: 'La memoria', source: null },
      ],
      [],
      [
        {
          id: 'c-new',
          year: 2026,
          month: 5,
          text: 'Crónica nueva del mes.',
          source_entity_ids: ['e1', 'e2'],
          generated_at: '2026-05-31T13:00:00.000Z',
          provider: 'openai',
          model: 'gpt',
        },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/cronicas/generate', {
        method: 'POST',
        body: JSON.stringify({ year: 2026, month: 5 }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: 'c-new',
      year: 2026,
      month: 5,
      text: 'Crónica nueva del mes.',
      sourceEntityIds: ['e1', 'e2'],
      generatedAt: '2026-05-31T13:00:00.000Z',
      provider: 'openai',
      model: 'gpt',
      alreadyExisted: false,
    })
    expect(cronicasMocks.askLLMForText).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('mayo de 2026'),
        }),
      ]),
      { provider: 'openai', model: 'gpt' },
    )
    const templates = mockSqlState.calls.map((call) => call.template).join('\n')
    expect(templates).toMatch(/INSERT INTO extraction_log/)
    expect(templates).toMatch(/INSERT INTO cronicas/)
    const cronicaWrite = mockSqlState.calls.find((call) =>
      /INSERT INTO cronicas/i.test(call.template),
    )
    expect(cronicaWrite?.values).toEqual(
      expect.arrayContaining([
        'legacy-single-user',
        2026,
        5,
        'Crónica nueva del mes.',
        JSON.stringify(['e1', 'e2']),
        'openai',
        'gpt',
      ]),
    )
  })
})
