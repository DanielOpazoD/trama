import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crossVerify } from './cross-verify.js'

const llmMocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForJson: llmMocks.askLLMForJson,
}))

const baseInput = {
  items: ['Borges', 'Pizarnik', 'Spinetta'],
  describe: (item: string, index: number) => `${index}:${item}`,
  context: 'clasificación de entidades',
  verifierProvider: 'gemini',
  verifierModel: 'gemini-test',
  primaryProviderName: 'openai',
}

describe('crossVerify', () => {
  beforeEach(() => {
    llmMocks.askLLMForJson.mockReset()
  })

  it('sale rápido sin llamar al LLM cuando no hay items', async () => {
    const result = await crossVerify({ ...baseInput, items: [] })

    expect(result.verdictsByIndex.size).toBe(0)
    expect(result.usage).toBeNull()
    expect(llmMocks.askLLMForJson).not.toHaveBeenCalled()
  })

  it('parsea veredictos válidos, normaliza índices y descarta fuera de rango', async () => {
    const usage = { provider: 'gemini', model: 'gemini-test', tokensIn: 1, tokensOut: 2 }
    llmMocks.askLLMForJson.mockResolvedValue({
      content: {
        verdicts: [
          { index: 1, agreed: true },
          { index: 2, agreed: false, note: ' tipo dudoso ' },
          { index: 9, agreed: false, note: 'fuera' },
        ],
      },
      usage,
    })

    const result = await crossVerify(baseInput)

    expect(result.usage).toBe(usage)
    expect(result.verdictsByIndex.get(0)).toEqual({ agreed: true, note: undefined })
    expect(result.verdictsByIndex.get(1)).toEqual({
      agreed: false,
      note: 'tipo dudoso',
    })
    expect(result.verdictsByIndex.has(8)).toBe(false)
    expect(llmMocks.askLLMForJson).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('1. 0:Borges'),
        }),
        { role: 'user', content: 'Revisa la lista y devuelve los veredictos.' },
      ],
      { provider: 'gemini', model: 'gemini-test' },
    )
  })

  it('ignora veredictos mal formados en vez de convertirlos en dudas', async () => {
    llmMocks.askLLMForJson.mockResolvedValue({
      content: {
        verdicts: [
          { index: 1, agreed: 'true' },
          { index: 2, note: 'sin booleano' },
          { index: '3', agreed: false, note: 'indice string' },
          { index: 3, agreed: false, note: 'sí cuenta' },
        ],
      },
      usage: null,
    })

    const result = await crossVerify(baseInput)

    expect([...result.verdictsByIndex.entries()]).toEqual([
      [2, { agreed: false, note: 'sí cuenta' }],
    ])
  })

  it('devuelve error y mapa vacío si falla el verificador', async () => {
    llmMocks.askLLMForJson.mockRejectedValueOnce(new Error('timeout'))

    const result = await crossVerify(baseInput)

    expect(result.verdictsByIndex.size).toBe(0)
    expect(result.usage).toBeNull()
    expect(result.error).toBe('timeout')
  })
})
