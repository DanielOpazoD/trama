import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const queryMocks = vi.hoisted(() => ({
  embedSafe: vi.fn(),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
}))

vi.mock('./embeddings.js', () => ({
  embedSafe: queryMocks.embedSafe,
  toPgVector: queryMocks.toPgVector,
}))

import { getSql } from './db.js'
import { runLexicalSearch, runSemanticSearch } from './search-endpoint-queries.js'

describe('search-endpoint-queries', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    queryMocks.embedSafe.mockReset()
    queryMocks.toPgVector.mockClear()
  })

  it('ejecuta las cinco ramas lexicales con user_id y limit duplicado', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: null,
          year: null,
          rank: 1,
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          entity_name: 'Borges',
          text: 'quote',
          source: null,
          rank: 1,
        },
      ],
      [
        {
          id: 'm1',
          kind: 'nota',
          captured_at: '2026-01-01',
          text: 'momento',
          rank: 1,
        },
      ],
      [{ id: 'c1', year: 2026, month: 5, text: 'cronica', rank: 1 }],
      [
        {
          id: 'cm1',
          thread_id: 't1',
          thread_title: null,
          role: 'assistant',
          text: 'chat',
          rank: 1,
        },
      ],
    )

    const result = await runLexicalSearch({
      sql: getSql(),
      q: 'borges',
      userId: 'u1',
      limit: 3,
      enabled: true,
    })

    expect(result.entities).toHaveLength(1)
    expect(result.quotes).toHaveLength(1)
    expect(result.momentos).toHaveLength(1)
    expect(result.cronicas).toHaveLength(1)
    expect(result.chat).toHaveLength(1)
    expect(mockSqlResponses.calls).toHaveLength(5)
    for (const call of mockSqlResponses.calls) {
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('u1')
      expect(call.values.at(-1)).toBe(6)
    }
  })

  it('arranca las ramas lexicales en paralelo antes de esperar resultados', async () => {
    const deferred = Array.from({ length: 5 }, () => {
      let resolve!: (rows: unknown[]) => void
      const promise = new Promise<unknown[]>((done) => {
        resolve = done
      })
      return { promise, resolve }
    })
    mockSqlState.responses.push(...deferred.map((entry) => entry.promise))

    const pending = runLexicalSearch({
      sql: getSql(),
      q: 'borges',
      userId: 'u1',
      limit: 3,
      enabled: true,
    })

    await vi.waitFor(() => expect(mockSqlResponses.calls).toHaveLength(5))
    for (const entry of deferred) entry.resolve([])
    await expect(pending).resolves.toEqual({
      entities: [],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
    })
  })

  it('omite queries lexicales cuando la rama no está habilitada', async () => {
    const result = await runLexicalSearch({
      sql: getSql(),
      q: 'borges',
      userId: 'u1',
      limit: 3,
      enabled: false,
    })

    expect(result).toEqual({
      entities: [],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
    })
    expect(mockSqlResponses.calls).toHaveLength(0)
  })

  it('ejecuta semantic solo con embedding disponible', async () => {
    queryMocks.embedSafe.mockResolvedValue({ vector: [0.1, 0.2] })
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: null,
          year: null,
          rank: 0,
          distance: 0.1,
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          entity_name: 'Borges',
          text: 'quote',
          source: null,
          rank: 0,
          distance: 0.2,
        },
      ],
      [
        {
          id: 'm1',
          kind: 'nota',
          captured_at: '2026-01-01',
          text: 'momento',
          rank: 0,
          distance: 0.3,
        },
      ],
    )

    const result = await runSemanticSearch({
      sql: getSql(),
      q: 'memoria',
      userId: 'u2',
      limit: 2,
      enabled: true,
    })

    expect(result.entities).toHaveLength(1)
    expect(result.quotes).toHaveLength(1)
    expect(result.momentos).toHaveLength(1)
    expect(queryMocks.embedSafe).toHaveBeenCalledWith('memoria')
    expect(queryMocks.toPgVector).toHaveBeenCalledWith([0.1, 0.2])
    expect(mockSqlResponses.calls).toHaveLength(3)
    for (const call of mockSqlResponses.calls) {
      expect(call.values).toContain('u2')
      expect(call.values.at(-1)).toBe(4)
    }
  })

  it('degrada semantic a listas vacías si embedding no está disponible', async () => {
    queryMocks.embedSafe.mockResolvedValue(null)

    const result = await runSemanticSearch({
      sql: getSql(),
      q: 'memoria',
      userId: 'u2',
      limit: 2,
      enabled: true,
    })

    expect(result).toEqual({ entities: [], quotes: [], momentos: [] })
    expect(mockSqlResponses.calls).toHaveLength(0)
  })
})
