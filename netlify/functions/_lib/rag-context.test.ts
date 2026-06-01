import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const ragMocks = vi.hoisted(() => ({
  askLLMForText: vi.fn(),
  embedSafe: vi.fn(),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
}))

vi.mock('./llm.js', () => ({
  askLLMForText: ragMocks.askLLMForText,
}))

vi.mock('./embeddings.js', () => ({
  embedSafe: ragMocks.embedSafe,
  toPgVector: ragMocks.toPgVector,
}))

import { buildRagContext } from './rag-context'

// rag-context.ts imports embedSafe from ./embeddings which reads
// Netlify.env. We stub it to a no-op so the semantic branch is skipped
// (returns null) — letting us test the merge + recency fallback purely.

beforeEach(() => {
  ragMocks.askLLMForText.mockReset()
  ragMocks.askLLMForText.mockRejectedValue(new Error('no key'))
  ragMocks.embedSafe.mockReset()
  ragMocks.embedSafe.mockResolvedValue(null)
  ragMocks.toPgVector.mockClear()
  vi.stubGlobal('Netlify', {
    env: {
      get: vi.fn(() => undefined),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type Tag<S extends TemplateStringsArray> = S

/**
 * Mock SQL client that lets us return different rows depending on which
 * fragment of the template literal we recognize. The signature matches
 * what buildRagContext expects.
 */
function makeSqlMock(
  responder: (strings: TemplateStringsArray, values: unknown[]) => unknown,
) {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    Promise.resolve(responder(strings, values))) as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>
}

describe('buildRagContext — fallback to recency when embedding key is absent', () => {
  it('returns merged recent entities + recent quotes + their relationships', async () => {
    const recentEntities = [
      { id: 'e1', name: 'Borges', type: 'escritor', year: 1899, description: null },
      { id: 'e2', name: 'Calvino', type: 'escritor', year: 1923, description: null },
    ]
    const recentQuotes = [{ id: 'q1', entity_name: 'Borges', text: '...', source: null }]
    const rels = [
      {
        id: 'r1',
        from_name: 'Borges',
        to_name: 'Calvino',
        type: 'influye_en',
        notes: null,
      },
    ]

    const sql = makeSqlMock((strings) => {
      const joined = strings.join(' ')
      if (
        joined.includes('FROM entities') &&
        joined.includes('ORDER BY created_at DESC')
      ) {
        return recentEntities
      }
      if (
        joined.includes('FROM quotes') &&
        joined.includes('ORDER BY q.created_at DESC')
      ) {
        return recentQuotes
      }
      if (joined.includes('FROM relationships') && joined.includes('= ANY')) {
        return rels
      }
      return []
    })

    const ctx = await buildRagContext(sql, 'qué hay de Borges?', 'test-user')
    expect(ctx.entities.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(ctx.quotes.map((q) => q.id)).toEqual(['q1'])
    expect(ctx.relationships.map((r) => r.id)).toEqual(['r1'])
    expect(ctx.usedRag).toBe(false)
  })

  it('returns no relationships when there are no entities to anchor them to', async () => {
    const sql = makeSqlMock(() => [])
    const ctx = await buildRagContext(sql, 'algo', 'test-user')
    expect(ctx.entities).toEqual([])
    expect(ctx.relationships).toEqual([])
    expect(ctx.quotes).toEqual([])
    expect(ctx.usedRag).toBe(false)
  })

  it('handles empty query gracefully (no embedding, only recency)', async () => {
    const recentE = [
      { id: 'e1', name: 'X', type: 'concepto', year: null, description: null },
    ]
    const sql = makeSqlMock((strings) => {
      const j = strings.join(' ')
      if (j.includes('FROM entities')) return recentE
      return []
    })
    const ctx = await buildRagContext(sql, '', 'test-user')
    expect(ctx.entities).toHaveLength(1)
    expect(ctx.usedRag).toBe(false)
  })

  it('HyDE: si está on pero la query es muy corta, no se aplica', async () => {
    const sql = makeSqlMock(() => [])
    // Sin API key, HyDE intentaría llamar askLLMForText y fallaría.
    // Para queries ≤10 chars, el chequeo de longitud lo desactiva antes.
    const ctx = await buildRagContext(sql, 'Bo', 'test-user', { hyde: true })
    expect(ctx.usedHyde).toBe(false)
  })

  it('HyDE: si la query es larga pero el LLM no responde, no rompe', async () => {
    // Sin API key, askLLMForText va a fallar internamente. La función
    // debe degradar a embebido directo (que tampoco funciona sin key,
    // así que termina en recency-only). El test verifica que NO throw.
    const sql = makeSqlMock(() => [])
    const ctx = await buildRagContext(
      sql,
      'qué tengo sobre el tiempo y la creación?',
      'test-user',
      { hyde: true },
    )
    // usedHyde puede ser false (porque askLLMForText falló) — lo
    // importante es que la llamada no haya crashed.
    expect(ctx).toBeDefined()
  })

  it('HyDE: registra costo y uso cuando genera documento hipotético', async () => {
    ragMocks.askLLMForText.mockResolvedValue({
      content:
        'Borges piensa el tiempo como una materia circular donde memoria, muerte y literatura se confunden.',
      usage: {
        provider: 'openai',
        model: 'gpt-test',
        tokensIn: 120,
        tokensOut: 24,
        costCents: 0.42,
        durationMs: 80,
      },
      fromCache: false,
    })
    ragMocks.embedSafe.mockResolvedValue({ vector: [0.1, 0.2] })

    const calls: Array<{ template: string; values: unknown[] }> = []
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ template: strings.join('?'), values })
      return Promise.resolve([])
    }) as unknown as Parameters<typeof buildRagContext>[0]

    const ctx = await buildRagContext(
      sql,
      'qué tengo sobre Borges, tiempo y memoria?',
      'user-hyde',
      {
        hyde: true,
        requestId: 'req-hyde',
      },
    )

    expect(ctx.usedHyde).toBe(true)
    expect(ragMocks.embedSafe).toHaveBeenCalledWith(
      'Borges piensa el tiempo como una materia circular donde memoria, muerte y literatura se confunden.',
    )
    const hydeLog = calls.find((call) =>
      /INSERT INTO extraction_log/i.test(call.template),
    )
    expect(hydeLog?.values).toEqual(
      expect.arrayContaining([
        'hyde:qué tengo sobre Borges, tiempo y memoria?',
        'openai',
        'gpt-test',
        120,
        24,
        0.42,
        80,
        'user-hyde',
      ]),
    )
  })
})
