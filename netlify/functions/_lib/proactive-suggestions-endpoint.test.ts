import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const proactiveMocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForJson: proactiveMocks.askLLMForJson,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: proactiveMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: proactiveMocks.checkMonthlyBudget,
}))

import handler from '../proactive-suggestions'

const usage = {
  provider: 'openai',
  model: 'gpt',
  tokensIn: 20,
  tokensOut: 11,
  costCents: 1.4,
  durationMs: 55,
}

describe('proactive-suggestions endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(proactiveMocks)) mock.mockReset()
    proactiveMocks.checkMonthlyBudget.mockResolvedValue(null)
    proactiveMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
  })

  it('lista sugerencias pendientes en shape camelCase e incluye user_id', async () => {
    mockSqlResponses.push([
      {
        id: 's1',
        kind: 'relationship',
        payload: { fromName: 'Borges' },
        status: 'pending',
        provider: 'openai',
        model: 'gpt',
        created_at: '2026-05-31T10:00:00.000Z',
        status_changed_at: null,
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/proactive-suggestions?status=pending'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      {
        id: 's1',
        kind: 'relationship',
        payload: { fromName: 'Borges' },
        status: 'pending',
        provider: 'openai',
        model: 'gpt',
        createdAt: '2026-05-31T10:00:00.000Z',
        statusChangedAt: null,
      },
    ])
    expect(mockSqlState.calls[0]?.template).toMatch(/WHERE status =/)
    expect(mockSqlState.calls[0]?.values).toContain('legacy-single-user')
  })

  it('devuelve vacío sin entidades y no llama al LLM', async () => {
    mockSqlResponses.push([], [], [], [], [], [], [])

    const res = await handler(
      new Request('http://localhost/api/proactive-suggestions', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inserted: 0, suggestions: [] })
    expect(proactiveMocks.askLLMForJson).not.toHaveBeenCalled()
  })

  it('filtra sugerencias inválidas y persiste solo payloads seguros', async () => {
    mockSqlResponses.push(
      [],
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          year: 1899,
          description: null,
        },
        {
          id: 'e2',
          name: 'Proust',
          type: 'persona',
          year: 1871,
          description: 'ya existe',
        },
        {
          id: 'e3',
          name: 'Miles',
          type: 'musico',
          year: 1926,
          description: null,
        },
      ],
      [
        { entity_id: 'e1', text: 'El tiempo circular' },
        { entity_id: 'e1', text: 'La biblioteca' },
        { entity_id: 'e3', text: 'Kind of Blue' },
      ],
      [{ from_name: 'Borges', to_name: 'Proust', type: 'influye_en' }],
      [{ slug: 'persona' }, { slug: 'musico' }, { slug: 'libro' }],
      [{ slug: 'influye_en' }],
      [
        {
          kind: 'relationship',
          payload: { fromName: 'Proust', type: 'influye_en', toName: 'Borges' },
        },
      ],
    )
    proactiveMocks.askLLMForJson.mockResolvedValue({
      content: {
        suggestions: [
          {
            kind: 'relationship',
            fromName: 'Borges',
            toName: 'Miles',
            type: 'influye_en',
            reason: 'Afinidad temporal',
          },
          {
            kind: 'relationship',
            fromName: 'Borges',
            toName: 'Proust',
            type: 'influye_en',
            reason: 'Duplicada',
          },
          {
            kind: 'relationship',
            fromName: 'Borges',
            toName: 'Borges',
            type: 'influye_en',
            reason: 'Auto vínculo',
          },
          {
            kind: 'reclassification',
            entityId: 'e1',
            name: 'Borges',
            newType: 'libro',
            reason: 'Provocado para test',
          },
          {
            kind: 'reclassification',
            entityId: 'e3',
            name: 'Miles',
            newType: 'musico',
            reason: 'Sin cambio',
          },
          {
            kind: 'description',
            entityId: 'e3',
            name: 'Miles',
            description: 'Trompetista de jazz.',
            reason: 'Falta descripción',
          },
          {
            kind: 'description',
            entityId: 'e2',
            name: 'Proust',
            description: 'Debe saltarse',
            reason: 'Ya tenía',
          },
        ],
      },
      usage,
      fromCache: false,
    })
    mockSqlResponses.push(
      [
        {
          id: 's-rel',
          kind: 'relationship',
          payload: {
            fromName: 'Borges',
            toName: 'Miles',
            type: 'influye_en',
            reason: 'Afinidad temporal',
          },
          status: 'pending',
          provider: 'openai',
          model: 'gpt',
          created_at: '2026-05-31T11:00:00.000Z',
          status_changed_at: null,
        },
      ],
      [
        {
          id: 's-rec',
          kind: 'reclassification',
          payload: {
            entityId: 'e1',
            name: 'Borges',
            oldType: 'persona',
            newType: 'libro',
            reason: 'Provocado para test',
          },
          status: 'pending',
          provider: 'openai',
          model: 'gpt',
          created_at: '2026-05-31T11:01:00.000Z',
          status_changed_at: null,
        },
      ],
      [
        {
          id: 's-desc',
          kind: 'description',
          payload: {
            entityId: 'e3',
            name: 'Miles',
            description: 'Trompetista de jazz.',
            reason: 'Falta descripción',
          },
          status: 'pending',
          provider: 'openai',
          model: 'gpt',
          created_at: '2026-05-31T11:02:00.000Z',
          status_changed_at: null,
        },
      ],
      [],
    )

    const res = await handler(
      new Request('http://localhost/api/proactive-suggestions', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inserted).toBe(3)
    expect(body.suggestions.map((s: { id: string }) => s.id)).toEqual([
      's-rel',
      's-rec',
      's-desc',
    ])
    expect(proactiveMocks.askLLMForJson).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      { provider: 'openai', model: 'gpt' },
    )
    const suggestionWrites = mockSqlState.calls.filter((call) =>
      /INSERT INTO proactive_suggestions/i.test(call.template),
    )
    expect(suggestionWrites).toHaveLength(3)
    expect(suggestionWrites.map((call) => JSON.parse(call.values[1] as string))).toEqual([
      {
        fromName: 'Borges',
        toName: 'Miles',
        type: 'influye_en',
        reason: 'Afinidad temporal',
      },
      {
        entityId: 'e1',
        name: 'Borges',
        oldType: 'persona',
        newType: 'libro',
        reason: 'Provocado para test',
      },
      {
        entityId: 'e3',
        name: 'Miles',
        description: 'Trompetista de jazz.',
        reason: 'Falta descripción',
      },
    ])
  })

  it('actualiza estado por PATCH y valida body con ApiErrors', async () => {
    const invalid = await handler(
      new Request('http://localhost/api/proactive-suggestions/s1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' }),
      }),
      mockContext({ id: 's1' }),
    )
    expect(invalid.status).toBe(400)

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/proactive-suggestions/s1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      }),
      mockContext({ id: 's1' }),
    )

    expect(res.status).toBe(204)
    expect(mockSqlState.calls[0]?.template).toMatch(/UPDATE proactive_suggestions/)
    expect(mockSqlState.calls[0]?.template).toMatch(/user_id/)
    expect(mockSqlState.calls[0]?.values).toEqual(
      expect.arrayContaining(['dismissed', 's1', 'legacy-single-user']),
    )
  })
})
