import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeEntity, describeQuote, llmRerank } from './llm-rerank.js'

const llmMocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForJson: llmMocks.askLLMForJson,
}))

const candidates = [
  { id: 'a', text: 'Camus y el absurdo.' },
  { id: 'b', text: 'Borges y bibliotecas infinitas.' },
  { id: 'c', text: 'Pizarnik y la noche.' },
]

describe('llmRerank', () => {
  beforeEach(() => {
    llmMocks.askLLMForJson.mockReset()
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
