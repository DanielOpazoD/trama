import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeEntity, describeQuote, llmRerank } from './llm-rerank.js'

const llmMocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
}))
const costMocks = vi.hoisted(() => ({
  checkMonthlyBudget: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForJson: llmMocks.askLLMForJson,
}))
vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: costMocks.checkMonthlyBudget,
}))

const candidates = [
  { id: 'a', text: 'Camus y el absurdo.' },
  { id: 'b', text: 'Borges y bibliotecas infinitas.' },
  { id: 'c', text: 'Pizarnik y la noche.' },
]

describe('llmRerank', () => {
  beforeEach(() => {
    llmMocks.askLLMForJson.mockReset()
    costMocks.checkMonthlyBudget.mockReset()
    costMocks.checkMonthlyBudget.mockResolvedValue(null)
  })

  it('devuelve rápido para cero o un candidato sin llamar al LLM', async () => {
    await expect(llmRerank('algo', [])).resolves.toEqual([])
    await expect(llmRerank('algo', [candidates[0]!])).resolves.toEqual(['a'])

    expect(llmMocks.askLLMForJson).not.toHaveBeenCalled()
  })

  it('filtra IDs inválidos, conserva ranking del LLM y agrega omitidos al final', async () => {
    llmMocks.askLLMForJson.mockResolvedValue({
      content: { ranking: ['c', 'missing', 'a'] },
    })

    await expect(llmRerank('noche', candidates)).resolves.toEqual(['c', 'a', 'b'])

    expect(llmMocks.askLLMForJson).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('noche'),
        }),
      ],
      undefined,
    )
  })

  it('respeta consider y override al limitar candidatos enviados al modelo', async () => {
    llmMocks.askLLMForJson.mockResolvedValue({
      content: { ranking: ['b'] },
    })

    await expect(
      llmRerank('biblioteca', candidates, {
        consider: 2,
        override: { provider: 'openai', model: 'gpt-test' },
      }),
    ).resolves.toEqual(['b', 'a'])

    const prompt = llmMocks.askLLMForJson.mock.calls[0]?.[0][0].content as string
    expect(prompt).toContain('id=a')
    expect(prompt).toContain('id=b')
    expect(prompt).not.toContain('id=c')
    expect(llmMocks.askLLMForJson.mock.calls[0]?.[1]).toEqual({
      provider: 'openai',
      model: 'gpt-test',
    })
  })

  it('devuelve null ante respuesta inválida o error del LLM', async () => {
    llmMocks.askLLMForJson.mockResolvedValueOnce({ content: { ranking: 'nope' } })
    await expect(llmRerank('x', candidates)).resolves.toBeNull()

    llmMocks.askLLMForJson.mockRejectedValueOnce(new Error('upstream'))
    await expect(llmRerank('x', candidates)).resolves.toBeNull()
  })

  it('no llama al modelo cuando el cost-cap bloquea el rerank observable', async () => {
    costMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    const sqlCalls: Array<{ template: string; values: unknown[] }> = []
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push({ template: strings.join(' '), values })
      return Promise.resolve([])
    }) as never

    await expect(
      llmRerank('biblioteca', candidates, {
        observability: {
          sql,
          userId: 'user_a',
          requestId: 'req-1',
          scope: 'search.entities',
        },
      }),
    ).resolves.toBeNull()

    expect(costMocks.checkMonthlyBudget).toHaveBeenCalledWith('user_a', 'req-1')
    expect(llmMocks.askLLMForJson).not.toHaveBeenCalled()
    expect(sqlCalls).toHaveLength(0)
  })

  it('registra extraction_log cuando el rerank observable usa LLM', async () => {
    llmMocks.askLLMForJson.mockResolvedValue({
      content: { ranking: ['b', 'a'] },
      usage: {
        provider: 'openai',
        model: 'gpt-test',
        tokensIn: 12,
        tokensOut: 3,
        costCents: 0.04,
        durationMs: 25,
      },
      fromCache: false,
    })
    const sqlCalls: Array<{ template: string; values: unknown[] }> = []
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push({ template: strings.join(' '), values })
      return Promise.resolve([])
    }) as never

    await expect(
      llmRerank('biblioteca', candidates, {
        observability: {
          sql,
          userId: 'user_a',
          requestId: 'req-2',
          scope: 'search.entities',
        },
      }),
    ).resolves.toEqual(['b', 'a', 'c'])

    const insert = sqlCalls.find((call) =>
      /INSERT INTO extraction_log/i.test(call.template),
    )
    expect(insert?.template).toMatch(/cost_cents/)
    expect(insert?.values).toEqual(
      expect.arrayContaining([
        'rerank:search.entities:biblioteca',
        'openai',
        'gpt-test',
        'user_a',
      ]),
    )
    expect(insert?.values).toEqual(expect.arrayContaining([12, 3, 0.04, 25]))
  })
})

describe('rerank describers', () => {
  it('describe entidades y citas con formato compacto y truncado', () => {
    expect(
      describeEntity({
        name: 'Borges',
        type: 'escritor',
        year: 1899,
        description: 'bibliotecario infinito',
      }),
    ).toBe('"Borges" [escritor, 1899] — bibliotecario infinito')

    const longText = 'x'.repeat(205)
    expect(
      describeQuote({
        text: longText,
        entityName: 'Borges',
        source: 'Ficciones',
      }),
    ).toBe(`de Borges [Ficciones]: «${'x'.repeat(197)}…»`)
  })
})
