import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const atlasMocks = vi.hoisted(() => ({
  askLLMForJson: vi.fn(),
  resolveAIInvocation: vi.fn(),
  checkMonthlyBudget: vi.fn(),
}))

vi.mock('./llm.js', () => ({
  askLLMForJson: atlasMocks.askLLMForJson,
}))

vi.mock('./ai-mode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai-mode.js')>()
  return {
    ...actual,
    resolveAIInvocation: atlasMocks.resolveAIInvocation,
  }
})

vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: atlasMocks.checkMonthlyBudget,
}))

import handler from '../atlas'

const usage = {
  provider: 'openai',
  model: 'gpt',
  tokensIn: 12,
  tokensOut: 7,
  costCents: 0.9,
  durationMs: 41,
}

describe('atlas endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    for (const mock of Object.values(atlasMocks)) mock.mockReset()
    atlasMocks.checkMonthlyBudget.mockResolvedValue(null)
    atlasMocks.resolveAIInvocation.mockResolvedValue({
      kind: 'ready',
      provider: 'openai',
      model: 'gpt',
      verifyWith: null,
    })
  })

  it('lee el snapshot y resuelve solo miembros vivos del usuario', async () => {
    mockSqlResponses.push(
      [
        {
          entity_count: 3,
          generated_at: '2026-05-31T12:00:00.000Z',
          provider: 'openai',
          model: 'gpt',
          clusters: [
            {
              id: 'c-0',
              name: 'Memoria',
              summary: 'Archivo y tiempo',
              memberIds: ['e1', 'e2', 'deleted'],
            },
            {
              id: 'empty',
              name: 'Vacía',
              summary: '',
              memberIds: ['deleted'],
            },
          ],
        },
      ],
      [
        { id: 'e1', name: 'Borges', type: 'persona', year: 1899 },
        { id: 'e2', name: 'Proust', type: 'persona', year: 1871 },
      ],
    )

    const res = await handler(new Request('http://localhost/api/atlas'), mockContext())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      generatedAt: '2026-05-31T12:00:00.000Z',
      entityCount: 3,
      provider: 'openai',
      model: 'gpt',
      clusters: [
        {
          id: 'c-0',
          name: 'Memoria',
          summary: 'Archivo y tiempo',
          members: [
            { id: 'e1', name: 'Borges', type: 'persona', year: 1899 },
            { id: 'e2', name: 'Proust', type: 'persona', year: 1871 },
          ],
        },
      ],
    })
    expect(mockSqlState.calls[1]?.template).toMatch(/deleted_at IS NULL/)
    expect(mockSqlState.calls[1]?.values).toContain('legacy-single-user')
  })

  it('valida ruta y cantidad mínima de entidades antes de llamar al LLM', async () => {
    const method = await handler(
      new Request('http://localhost/api/atlas/generate', { method: 'PUT' }),
      mockContext(),
    )
    expect(method.status).toBe(405)

    mockSqlResponses.push(
      [],
      [
        { id: 'e1', name: 'A', type: 'persona', embedding: '[1,0]' },
        { id: 'e2', name: 'B', type: 'persona', embedding: null },
        { id: 'e3', name: 'C', type: 'persona', embedding: 'no-json' },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/atlas/generate', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: { code: 'UNPROCESSABLE' },
    })
    expect(atlasMocks.askLLMForJson).not.toHaveBeenCalled()
  })

  it('genera constelaciones, persiste snapshot y devuelve miembros camelCase', async () => {
    const entityRows = [
      { id: 'e1', name: 'Borges', type: 'persona', embedding: '[1,0]' },
      { id: 'e2', name: 'Piglia', type: 'persona', embedding: '[0.9,0.1]' },
      { id: 'e3', name: 'Archivo', type: 'concepto', embedding: '[0.8,0.2]' },
      { id: 'e4', name: 'Coltrane', type: 'musico', embedding: '[0,1]' },
      { id: 'e5', name: 'Miles', type: 'musico', embedding: '[0.1,0.9]' },
      { id: 'e6', name: 'Blue in Green', type: 'cancion', embedding: '[0.2,0.8]' },
    ]
    atlasMocks.askLLMForJson.mockResolvedValue({
      content: {
        constelaciones: [
          { index: 0, name: 'Archivo narrativo', summary: 'Lecturas y memoria' },
          { index: 1, name: 'Jazz modal', summary: 'Música e improvisación' },
        ],
      },
      usage,
      fromCache: false,
    })
    mockSqlResponses.push(
      [],
      entityRows,
      [],
      [],
      [
        {
          entity_count: 6,
          generated_at: '2026-05-31T13:00:00.000Z',
          provider: 'openai',
          model: 'gpt',
          clusters: [
            {
              id: 'c-0',
              name: 'Archivo narrativo',
              summary: 'Lecturas y memoria',
              memberIds: ['e1', 'e2', 'e3'],
            },
            {
              id: 'c-1',
              name: 'Jazz modal',
              summary: 'Música e improvisación',
              memberIds: ['e4', 'e5', 'e6'],
            },
          ],
        },
      ],
      entityRows.map(({ embedding, ...row }) => ({ ...row, year: null })),
    )

    const res = await handler(
      new Request('http://localhost/api/atlas/generate', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clusters).toHaveLength(2)
    expect(body.clusters[0]).toMatchObject({
      id: 'c-0',
      name: 'Archivo narrativo',
      members: expect.arrayContaining([
        expect.objectContaining({ id: 'e1', name: 'Borges' }),
      ]),
    })
    expect(atlasMocks.askLLMForJson).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      { provider: 'openai', model: 'gpt' },
    )
    const snapshotWrite = mockSqlState.calls.find((call) =>
      /INSERT INTO atlas_snapshots/i.test(call.template),
    )
    expect(snapshotWrite?.values).toContain('legacy-single-user')
    const persistedClusters = JSON.parse(snapshotWrite?.values[2] as string)
    expect(persistedClusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Archivo narrativo',
          memberIds: expect.arrayContaining(['e1', 'e2', 'e3']),
        }),
        expect.objectContaining({
          name: 'Jazz modal',
          memberIds: expect.arrayContaining(['e4', 'e5', 'e6']),
        }),
      ]),
    )
  })
})
