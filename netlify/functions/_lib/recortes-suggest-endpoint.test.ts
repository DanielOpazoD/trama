import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: vi.fn(async () => null),
}))
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: vi.fn(),
  aiOffResponse: vi.fn(
    () => new Response(JSON.stringify({ aiOff: true }), { status: 200 }),
  ),
}))
vi.mock('./llm.js', () => ({
  askLLMForJson: vi.fn(),
}))

import recortesHandler from '../recortes'
import { resolveAIInvocation } from './ai-mode'
import { askLLMForJson } from './llm'

const ID = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff'
const REC = {
  text: 'La memoria es un taller.',
  source_url: 'https://x.com',
  source_title: 'El taller',
  source_author: null,
}

function suggestReq() {
  return new Request(`http://localhost/api/recortes/${ID}/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}

beforeEach(() => {
  mockSqlResponses.reset()
  vi.mocked(resolveAIInvocation).mockReset()
  vi.mocked(askLLMForJson).mockReset()
})

describe('recortes /suggest', () => {
  it('404 si el recorte no existe', async () => {
    mockSqlResponses.push([]) // SELECT recorte → vacío
    const res = await recortesHandler(suggestReq(), mockContext({ id: ID }))
    expect(res.status).toBe(404)
  })

  it('degrada a aiOff cuando la IA está apagada', async () => {
    mockSqlResponses.push([REC]) // recorte existe
    vi.mocked(resolveAIInvocation).mockResolvedValue({ kind: 'off' })
    const res = await recortesHandler(suggestReq(), mockContext({ id: ID }))
    expect(res.status).toBe(200)
    expect((await res.json()).aiOff).toBe(true)
    // No se llamó al modelo.
    expect(askLLMForJson).not.toHaveBeenCalled()
  })

  it('devuelve la sugerencia saneada con las entidades relacionadas', async () => {
    mockSqlResponses.push([REC]) // recorte
    mockSqlResponses.push([{ slug: 'escritor' }, { slug: 'libro' }]) // tipos
    mockSqlResponses.push([
      { id: 'e1', name: 'Borges', type: 'escritor' },
      { id: 'e2', name: 'Rayuela', type: 'libro' },
    ]) // entidades
    vi.mocked(resolveAIInvocation).mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: null,
      verifyWith: null,
    })
    vi.mocked(askLLMForJson).mockResolvedValue({
      content: {
        target: 'quote',
        title: 'Sobre la memoria',
        rationale: 'Es una frase citable.',
        relatedEntityIds: ['e1', 'inventado'],
        suggestedEntityName: null,
        suggestedEntityType: null,
      },
    } as unknown as Awaited<ReturnType<typeof askLLMForJson>>)

    const res = await recortesHandler(suggestReq(), mockContext({ id: ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.target).toBe('quote')
    // El id inventado se descarta; solo queda e1.
    expect(body.relatedEntityIds).toEqual(['e1'])
    expect(body.relatedEntities).toEqual([{ id: 'e1', name: 'Borges', type: 'escritor' }])
  })
})
